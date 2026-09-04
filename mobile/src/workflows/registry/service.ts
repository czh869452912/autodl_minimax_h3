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
import { WORKFLOW_PACKAGE_IDENTITY_V1 } from './identity';

export class RegistryError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = 'RegistryError'; } }
type Dependencies = { repository: WorkflowRegistry; adapters: Array<Pick<PlatformAdapterManifest, 'id' | 'operations'>>; appVersion: string; adapterVersions?: Record<string, string>; adapterArtifactKinds?: Record<string, string[]>; fetch?: typeof fetch; keyring?: RegistryKey[]; allowDomains?: string[]; now?: () => number; fetchTimeoutMs?: number; maxResponseBytes?: number };
const rank: Record<RegistrySource, number> = { builtin: 3, 'local-import': 2, remote: 1 };

export type WorkflowPackageSource = RegistrySource | 'git';
export type VerifiedWorkflowPackage = { pkg: WorkflowPackage; definition: WorkflowDefinition; packageHash: string };

const canonicalizePackage = (pkg: WorkflowPackage): string => canonicalizeDefinition(JSON.parse(JSON.stringify(pkg)));

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
  const canonicalInput = JSON.parse(JSON.stringify({ ...pkg, metadata: metadataWithoutHash }));
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
  const installAndActivate = async (record: RegistryRecord): Promise<void> => {
    if (deps.repository.installAndActivate) return deps.repository.installAndActivate(record);
    await deps.repository.upsert(record);
    await deps.repository.setActive(record.workflowId, record.version, record.contentHash);
  };
  const parsePayload = async (payload: unknown, source: WorkflowPackageSource): Promise<VerifiedWorkflowPackage> => parseVerifiedWorkflowPackage(payload, source);
  const createBuiltinRecord = async (definition: WorkflowDefinition): Promise<RegistryRecord> => {
    const verified = await parseVerifiedWorkflowPackage(definition, 'builtin');
    const result = validateWorkflowDefinition(verified.definition, adapterContext);
    if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', 'builtin definition is invalid');
    checkCompatibility(result.value);
    return {
      workflowId: definition.id,
      version: definition.version,
      contentHash: verified.packageHash,
      hashScheme: WORKFLOW_PACKAGE_IDENTITY_V1,
      source: 'builtin',
      trust: 'builtin',
      definitionJson: canonicalizePackage(verified.pkg),
      installedAt: (deps.now ?? Date.now)(),
    };
  };
  const fetchSafe = async (url: string): Promise<string> => {
    const controller = new AbortController();
    const timeoutMs = deps.fetchTimeoutMs ?? 15000;
    const limit = deps.maxResponseBytes ?? 1024 * 1024;
    let current = url;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let rejectTimeout: ((error: Error) => void) | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => { rejectTimeout = reject; });
    const timeout = () => { controller.abort(); rejectTimeout?.(new RegistryError('REGISTRY_TIMEOUT', 'registry request timed out')); };
    timeoutId = setTimeout(timeout, timeoutMs);
    try {
      let response: Response | undefined;
      for (let hop = 0; hop <= 3; hop += 1) {
        if (!allowedUrl(current, deps.allowDomains ?? [])) throw new RegistryError('REGISTRY_DOMAIN_REJECTED', 'registry URL is not allowlisted HTTPS');
        response = await Promise.race([fetcher(current, { signal: controller.signal, redirect: 'manual' }), timeoutPromise]);
        if (response.status >= 300 && response.status < 400) {
          if (hop === 3) throw new RegistryError('REGISTRY_FETCH_FAILED', 'registry redirect limit exceeded');
          const location = response.headers.get('location');
          if (!location) throw new RegistryError('REGISTRY_FETCH_FAILED', 'registry redirect is missing a target');
          current = new URL(location, current).toString();
          continue;
        }
        if (!response.ok) throw new RegistryError('REGISTRY_FETCH_FAILED', `registry request failed with status ${response.status}`);
        const length = Number(response.headers.get('content-length') ?? 0);
        if (length > limit) throw new RegistryError('REGISTRY_RESPONSE_TOO_LARGE', 'registry response exceeds size limit');
        const reader = response.body?.getReader();
        if (!reader) {
          const text = await Promise.race([response.text(), timeoutPromise]);
          if (new TextEncoder().encode(text).byteLength > limit) throw new RegistryError('REGISTRY_RESPONSE_TOO_LARGE', 'registry response exceeds size limit');
          return text;
        }
        const chunks: Uint8Array[] = []; let total = 0;
        while (true) {
          const part = await Promise.race([reader.read(), timeoutPromise]);
          if (part.done) break;
          total += part.value.byteLength;
          if (total > limit) { await reader.cancel(); throw new RegistryError('REGISTRY_RESPONSE_TOO_LARGE', 'registry response exceeds size limit'); }
          chunks.push(part.value);
        }
        const merged = new Uint8Array(total); let offset = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
        return new TextDecoder().decode(merged);
      }
      throw new RegistryError('REGISTRY_FETCH_FAILED', 'registry redirect limit exceeded');
    } catch (error) {
      if (error instanceof RegistryError) throw error;
      if (controller.signal.aborted) throw new RegistryError('REGISTRY_TIMEOUT', 'registry request timed out');
      throw error;
    } finally { if (timeoutId) clearTimeout(timeoutId); }
  };
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
      const record: RegistryRecord = { workflowId: result.value.id, version: result.value.version, contentHash: verified.packageHash, hashScheme: WORKFLOW_PACKAGE_IDENTITY_V1, source: 'local-import', trust: 'untrusted-local', definitionJson: canonicalizePackage(verified.pkg), installedAt: (deps.now ?? Date.now)() };
      await deps.repository.upsert(record);
      return record;
    },
    async installBuiltin(definition: WorkflowDefinition): Promise<RegistryRecord> {
      const record = await createBuiltinRecord(definition);
      await deps.repository.upsert(record);
      return record;
    },
    async activateBuiltin(definition: WorkflowDefinition): Promise<void> {
      await installAndActivate(await createBuiltinRecord(definition));
    },
    async syncRemoteIndex(url: string): Promise<RegistryIndex> {
      if (!allowedUrl(url, deps.allowDomains ?? [])) throw new RegistryError('REGISTRY_DOMAIN_REJECTED', 'registry URL is not allowlisted HTTPS');
      const body = JSON.parse(await fetchSafe(url)) as RegistryIndex;
      const key = keyring.find((item) => item.registryId === body.registryId);
      if (!key || !(await verifySignedPayload(canonicalizeDefinition({ registryId: body.registryId, entries: body.entries }), body.signature, key, (deps.now ?? Date.now)()))) throw new RegistryError('REGISTRY_SIGNATURE_INVALID', 'registry index signature is invalid');
      return body;
    },
    async fetchAndActivate(workflowId: string, version: string, baseUrl: string): Promise<RegistryRecord> {
      const index = await this.syncRemoteIndex(`${baseUrl.replace(/\/$/, '')}/registry/index.json`);
      const entry = index.entries.find((item) => item.workflowId === workflowId && item.version === version);
      if (!entry) throw new RegistryError('REGISTRY_NOT_FOUND', 'workflow version is not listed');
       const verified = await parsePayload(JSON.parse(await fetchSafe(`${baseUrl.replace(/\/$/, '')}/registry/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(version)}.json`)), 'remote');
       const result = validateWorkflowDefinition(verified.definition, adapterContext);
      if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', 'remote workflow definition is invalid');
      checkCompatibility(result.value);
       const canonical = canonicalizePackage(verified.pkg);
       const hash = verified.packageHash;
      if (hash !== entry.contentHash) throw new RegistryError('REGISTRY_HASH_MISMATCH', 'workflow content hash does not match index');
      const signature = (await fetchSafe(`${baseUrl.replace(/\/$/, '')}/registry/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(version)}.sig`)).trim();
      const key = keyring.find((item) => item.registryId === index.registryId);
       if (!key || !(await verifySignedPayload(canonical, signature, key, (deps.now ?? Date.now)()))) throw new RegistryError('REGISTRY_SIGNATURE_INVALID', 'workflow package signature is invalid');
      const record: RegistryRecord = { workflowId, version, contentHash: hash, hashScheme: WORKFLOW_PACKAGE_IDENTITY_V1, source: 'remote', trust: 'trusted', definitionJson: canonical, installedAt: (deps.now ?? Date.now)() };
      await installAndActivate(record);
      return record;
    },
    async installGitPackage(config: GitSubscriptionConfig, attestation: CommitAttestation, attestationSignature: string, payload: unknown): Promise<RegistryRecord> {
      const verified = await verifyCommitAttestation(attestation, attestationSignature, config, (deps.now ?? Date.now)());
      if (!verified.ok) throw new RegistryError('REGISTRY_GIT_ATTESTATION_INVALID', verified.message);
       const verifiedPackage = await parsePayload(payload, 'git');
       const result = validateWorkflowDefinition(verifiedPackage.definition, adapterContext);
      if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', 'git workflow definition is invalid');
      checkCompatibility(result.value);
       const canonical = canonicalizePackage(verifiedPackage.pkg); const hash = verifiedPackage.packageHash;
       const entry = verified.attestation.entries.find((item) => item.workflowId === result.value.id && item.version === result.value.version);
      if (!entry || entry.contentHash !== hash) throw new RegistryError('REGISTRY_HASH_MISMATCH', 'git workflow hash does not match attestation');
      const record: RegistryRecord = { workflowId: result.value.id, version: result.value.version, contentHash: hash, hashScheme: WORKFLOW_PACKAGE_IDENTITY_V1, source: 'remote', trust: 'trusted', definitionJson: canonical, installedAt: (deps.now ?? Date.now)(), repository: config.repository, ref: config.allowedRef, commit: verified.attestation.commit };
      await installAndActivate(record); return record;
    },
  };
}
