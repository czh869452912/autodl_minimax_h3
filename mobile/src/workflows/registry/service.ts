import { canonicalizeDefinition } from './canonicalize';
import { parseWorkflowImport } from './import';
import { sha256Hex } from './crypto';
import { verifySignedPayload } from './trust';
import type { WorkflowDefinition, PlatformAdapterManifest } from '../schema/types';
import type { RegistryIndex, RegistryRecord, RegistryKey, WorkflowRegistry, RegistrySource } from './types';
import { validateWorkflowDefinition } from '../schema/validator';
import { compareVersions, satisfiesVersion } from './semver';
import { legacyDefinitionToPackage, parseWorkflowPackage, packageToDefinition, type WorkflowPackage } from '../schema/package';
import { verifyCommitAttestation, type GitSubscriptionConfig, type CommitAttestation } from './gitSource';

export class RegistryError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = 'RegistryError'; } }
type Dependencies = { repository: WorkflowRegistry; adapters: Array<Pick<PlatformAdapterManifest, 'id' | 'operations'>>; appVersion: string; adapterVersions?: Record<string, string>; adapterArtifactKinds?: Record<string, string[]>; fetch?: typeof fetch; keyring?: RegistryKey[]; allowDomains?: string[]; now?: () => number; fetchTimeoutMs?: number; maxResponseBytes?: number };
const rank: Record<RegistrySource, number> = { builtin: 3, 'local-import': 2, remote: 1 };

export type WorkflowPackageSource = RegistrySource | 'git';
export type VerifiedWorkflowPackage = { pkg: WorkflowPackage; definition: WorkflowDefinition; packageHash: string };

export async function parseVerifiedWorkflowPackage(input: unknown, source: WorkflowPackageSource): Promise<VerifiedWorkflowPackage> {
  let pkg: WorkflowPackage;
  if (input && typeof input === 'object' && (input as Record<string, unknown>).apiVersion === 'workflow.autodl/v1') {
    pkg = parseWorkflowPackage(input);
  } else if (source === 'builtin') {
    pkg = legacyDefinitionToPackage(input as WorkflowDefinition);
  } else {
    throw new RegistryError('REGISTRY_PACKAGE_REQUIRED', 'non-builtin workflow content must be a declarative WorkflowPackage');
  }
  const { contentHash: _declaredHash, ...metadataWithoutHash } = pkg.metadata;
  const canonicalInput = { ...pkg, metadata: metadataWithoutHash };
  const canonical = canonicalizeDefinition(canonicalInput);
  const packageHash = await sha256Hex(canonical);
  if (pkg.metadata.contentHash && pkg.metadata.contentHash !== packageHash) {
    throw new RegistryError('REGISTRY_HASH_MISMATCH', 'workflow package content hash does not match canonical package');
  }
  return { pkg, definition: packageToDefinition(pkg), packageHash };
}

function allowedUrl(value: string, allowDomains: string[]): boolean { try { const url = new URL(value); return url.protocol === 'https:' && allowDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)); } catch { return false; } }

export function createWorkflowRegistryService(deps: Dependencies) {
  const fetcher = deps.fetch ?? fetch;
  const keyring = deps.keyring ?? [];
  const adapterContext = { adapters: deps.adapters.map((adapter) => ({ id: adapter.id, operations: adapter.operations })) };
  const checkCompatibility = (definition: WorkflowDefinition) => {
    const compatibility = definition.compatibility;
    if (compatibility?.minAppVersion && compareVersions(deps.appVersion, compatibility.minAppVersion) < 0) throw new RegistryError('REGISTRY_INCOMPATIBLE', 'workflow requires a newer app version');
    const adapterVersion = deps.adapterVersions?.[definition.platform.adapter];
    if (compatibility?.requiredAdapterVersion && (!adapterVersion || !satisfiesVersion(adapterVersion, compatibility.requiredAdapterVersion))) throw new RegistryError('REGISTRY_INCOMPATIBLE', 'workflow requires an incompatible adapter version');
    const supported = deps.adapterArtifactKinds?.[definition.platform.adapter];
    if (supported && compatibility?.artifactKinds?.some((kind) => !supported.includes(kind))) throw new RegistryError('REGISTRY_INCOMPATIBLE', 'workflow artifact kind is unsupported');
  };
  const parsePayload = async (payload: unknown, source: WorkflowPackageSource): Promise<VerifiedWorkflowPackage> => parseVerifiedWorkflowPackage(payload, source);
  const fetchSafe = async (url: string): Promise<Response> => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), deps.fetchTimeoutMs ?? 15000);
    try {
      const response = await fetcher(url, { signal: controller.signal });
      if (!response.ok) throw new RegistryError('REGISTRY_FETCH_FAILED', `registry request failed with status ${response.status}`);
      const length = Number(response.headers.get('content-length') ?? 0); if (length > (deps.maxResponseBytes ?? 1024 * 1024)) throw new RegistryError('REGISTRY_RESPONSE_TOO_LARGE', 'registry response exceeds size limit');
      return response;
    } finally { clearTimeout(timer); }
  };
  const readLimited = async (response: Response): Promise<string> => {
    const limit = deps.maxResponseBytes ?? 1024 * 1024; const reader = response.body?.getReader();
    if (!reader) { const text = await response.text(); if (new TextEncoder().encode(text).byteLength > limit) throw new RegistryError('REGISTRY_RESPONSE_TOO_LARGE', 'registry response exceeds size limit'); return text; }
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > limit) { await reader.cancel(); throw new RegistryError('REGISTRY_RESPONSE_TOO_LARGE', 'registry response exceeds size limit'); } chunks.push(part.value); }
    const merged = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(merged);
  };
  const readJsonLimited = async (response: Response): Promise<unknown> => JSON.parse(await readLimited(response));
  return {
    async discoverWorkflows(): Promise<RegistryRecord[]> {
      const records = await deps.repository.list();
      const selected = new Map<string, RegistryRecord>();
      for (const record of records) {
        const active = await deps.repository.getActive(record.workflowId);
        const chosen = active ?? records.find((item) => item.workflowId === record.workflowId && item.source === 'builtin');
        if (chosen && !selected.has(record.workflowId)) selected.set(record.workflowId, chosen);
      }
      return Array.from(selected.values()).sort((a, b) => a.workflowId.localeCompare(b.workflowId));
    },
    async importWorkflow(text: string, format: 'json' | 'yaml'): Promise<RegistryRecord> {
      const verified = await parsePayload(parseWorkflowImport(text, format), 'local-import');
      const result = validateWorkflowDefinition(verified.definition, adapterContext);
      if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', result.errors.map((error) => error.message).join('; '));
      checkCompatibility(result.value);
      const record: RegistryRecord = { workflowId: result.value.id, version: result.value.version, contentHash: verified.packageHash, source: 'local-import', trust: 'untrusted-local', definitionJson: canonicalizeDefinition(verified.pkg), installedAt: (deps.now ?? Date.now)() };
      await deps.repository.upsert(record);
      return record;
    },
    async activateBuiltin(definition: WorkflowDefinition): Promise<void> {
      const verified = await parseVerifiedWorkflowPackage(definition, 'builtin');
      const result = validateWorkflowDefinition(verified.definition, adapterContext);
      if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', 'builtin definition is invalid');
      checkCompatibility(result.value);
      const canonical = canonicalizeDefinition(verified.pkg);
      await deps.repository.upsert({ workflowId: definition.id, version: definition.version, contentHash: verified.packageHash, source: 'builtin', trust: 'builtin', definitionJson: canonical, installedAt: (deps.now ?? Date.now)() });
      await deps.repository.setActive(definition.id, definition.version, verified.packageHash);
    },
    async syncRemoteIndex(url: string): Promise<RegistryIndex> {
      if (!allowedUrl(url, deps.allowDomains ?? [])) throw new RegistryError('REGISTRY_DOMAIN_REJECTED', 'registry URL is not allowlisted HTTPS');
      const response = await fetchSafe(url);
      const body = await readJsonLimited(response) as RegistryIndex;
      const key = keyring.find((item) => item.registryId === body.registryId);
      if (!key || !(await verifySignedPayload(canonicalizeDefinition({ registryId: body.registryId, entries: body.entries }), body.signature, key, (deps.now ?? Date.now)()))) throw new RegistryError('REGISTRY_SIGNATURE_INVALID', 'registry index signature is invalid');
      return body;
    },
    async fetchAndActivate(workflowId: string, version: string, baseUrl: string): Promise<RegistryRecord> {
      const index = await this.syncRemoteIndex(`${baseUrl.replace(/\/$/, '')}/registry/index.json`);
      const entry = index.entries.find((item) => item.workflowId === workflowId && item.version === version);
      if (!entry) throw new RegistryError('REGISTRY_NOT_FOUND', 'workflow version is not listed');
      const response = await fetchSafe(`${baseUrl.replace(/\/$/, '')}/registry/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(version)}.json`);
       const verified = await parsePayload(await readJsonLimited(response), 'remote');
       const result = validateWorkflowDefinition(verified.definition, adapterContext);
      if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', 'remote workflow definition is invalid');
      checkCompatibility(result.value);
       const canonical = canonicalizeDefinition(verified.pkg);
       const hash = verified.packageHash;
      if (hash !== entry.contentHash) throw new RegistryError('REGISTRY_HASH_MISMATCH', 'workflow content hash does not match index');
      const signatureResponse = await fetchSafe(`${baseUrl.replace(/\/$/, '')}/registry/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(version)}.sig`);
      const signature = (await readLimited(signatureResponse)).trim();
      const key = keyring.find((item) => item.registryId === index.registryId);
       if (!key || !(await verifySignedPayload(canonical, signature, key, (deps.now ?? Date.now)()))) throw new RegistryError('REGISTRY_SIGNATURE_INVALID', 'workflow package signature is invalid');
      const record: RegistryRecord = { workflowId, version, contentHash: hash, source: 'remote', trust: 'trusted', definitionJson: canonical, installedAt: (deps.now ?? Date.now)() };
      await deps.repository.upsert(record);
      return record;
    },
    async installGitPackage(config: GitSubscriptionConfig, attestation: CommitAttestation, attestationSignature: string, payload: unknown): Promise<RegistryRecord> {
      const verified = await verifyCommitAttestation(attestation, attestationSignature, config, (deps.now ?? Date.now)());
      if (!verified.ok) throw new RegistryError('REGISTRY_GIT_ATTESTATION_INVALID', verified.message);
       const verifiedPackage = await parsePayload(payload, 'git');
       const result = validateWorkflowDefinition(verifiedPackage.definition, adapterContext);
      if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', 'git workflow definition is invalid');
      checkCompatibility(result.value);
       const canonical = canonicalizeDefinition(verifiedPackage.pkg); const hash = verifiedPackage.packageHash;
       const entry = verified.attestation.entries.find((item) => item.workflowId === result.value.id && item.version === result.value.version);
      if (!entry || entry.contentHash !== hash) throw new RegistryError('REGISTRY_HASH_MISMATCH', 'git workflow hash does not match attestation');
      const record: RegistryRecord = { workflowId: result.value.id, version: result.value.version, contentHash: hash, source: 'remote', trust: 'trusted', definitionJson: canonical, installedAt: (deps.now ?? Date.now)(), repository: config.repository, ref: config.allowedRef, commit: verified.attestation.commit };
      await deps.repository.upsert(record); await deps.repository.setActive(record.workflowId, record.version, record.contentHash); return record;
    },
  };
}
