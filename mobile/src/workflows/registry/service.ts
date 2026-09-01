import { canonicalizeDefinition } from './canonicalize';
import { parseWorkflowImport } from './import';
import { sha256Hex } from './crypto';
import { verifySignedPayload } from './trust';
import type { WorkflowDefinition, PlatformAdapterManifest } from '../schema/types';
import type { RegistryIndex, RegistryRecord, RegistryKey, WorkflowRegistry, RegistrySource } from './types';
import { validateWorkflowDefinition } from '../schema/validator';
import { compareVersions, satisfiesVersion } from './semver';

export class RegistryError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = 'RegistryError'; } }
type Dependencies = { repository: WorkflowRegistry; adapters: Array<Pick<PlatformAdapterManifest, 'id' | 'operations'>>; appVersion: string; adapterVersions?: Record<string, string>; adapterArtifactKinds?: Record<string, string[]>; fetch?: typeof fetch; keyring?: RegistryKey[]; allowDomains?: string[]; now?: () => number; fetchTimeoutMs?: number; maxResponseBytes?: number };
const rank: Record<RegistrySource, number> = { builtin: 3, 'local-import': 2, remote: 1 };

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
  const fetchSafe = async (url: string): Promise<Response> => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), deps.fetchTimeoutMs ?? 15000);
    try {
      const response = await fetcher(url, { signal: controller.signal });
      if (!response.ok) throw new RegistryError('REGISTRY_FETCH_FAILED', `registry request failed with status ${response.status}`);
      const length = Number(response.headers.get('content-length') ?? 0); if (length > (deps.maxResponseBytes ?? 1024 * 1024)) throw new RegistryError('REGISTRY_RESPONSE_TOO_LARGE', 'registry response exceeds size limit');
      return response;
    } finally { clearTimeout(timer); }
  };
  return {
    async discoverWorkflows(): Promise<RegistryRecord[]> {
      const records = await deps.repository.list();
      const selected = new Map<string, RegistryRecord>();
      for (const record of records) {
        const active = await deps.repository.getActive(record.workflowId);
        const chosen = active ?? (records.filter((item) => item.workflowId === record.workflowId).sort((a, b) => rank[b.source] - rank[a.source])[0]);
        if (chosen && !selected.has(record.workflowId)) selected.set(record.workflowId, chosen);
      }
      return Array.from(selected.values()).sort((a, b) => a.workflowId.localeCompare(b.workflowId));
    },
    async importWorkflow(text: string, format: 'json' | 'yaml'): Promise<RegistryRecord> {
      const definition = parseWorkflowImport(text, format);
      const result = validateWorkflowDefinition(definition, adapterContext);
      if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', result.errors.map((error) => error.message).join('; '));
      checkCompatibility(result.value);
      const canonical = canonicalizeDefinition(definition);
      const record: RegistryRecord = { workflowId: result.value.id, version: result.value.version, contentHash: await sha256Hex(canonical), source: 'local-import', trust: 'untrusted-local', definitionJson: canonical, installedAt: (deps.now ?? Date.now)() };
      await deps.repository.upsert(record);
      return record;
    },
    async activateBuiltin(definition: WorkflowDefinition): Promise<void> {
      const result = validateWorkflowDefinition(definition, adapterContext);
      if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', 'builtin definition is invalid');
      checkCompatibility(result.value);
      const canonical = canonicalizeDefinition(definition);
      const hash = await sha256Hex(canonical);
      await deps.repository.upsert({ workflowId: definition.id, version: definition.version, contentHash: hash, source: 'builtin', trust: 'builtin', definitionJson: canonical, installedAt: (deps.now ?? Date.now)() });
      await deps.repository.setActive(definition.id, definition.version, hash);
    },
    async syncRemoteIndex(url: string): Promise<RegistryIndex> {
      if (!allowedUrl(url, deps.allowDomains ?? [])) throw new RegistryError('REGISTRY_DOMAIN_REJECTED', 'registry URL is not allowlisted HTTPS');
      const response = await fetchSafe(url);
      const body = await response.json() as RegistryIndex;
      const key = keyring.find((item) => item.registryId === body.registryId);
      if (!key || !(await verifySignedPayload(canonicalizeDefinition({ registryId: body.registryId, entries: body.entries }), body.signature, key, (deps.now ?? Date.now)()))) throw new RegistryError('REGISTRY_SIGNATURE_INVALID', 'registry index signature is invalid');
      return body;
    },
    async fetchAndActivate(workflowId: string, version: string, baseUrl: string): Promise<RegistryRecord> {
      const index = await this.syncRemoteIndex(`${baseUrl.replace(/\/$/, '')}/registry/index.json`);
      const entry = index.entries.find((item) => item.workflowId === workflowId && item.version === version);
      if (!entry) throw new RegistryError('REGISTRY_NOT_FOUND', 'workflow version is not listed');
      const response = await fetchSafe(`${baseUrl.replace(/\/$/, '')}/registry/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(version)}.json`);
      const definition = await response.json();
      const result = validateWorkflowDefinition(definition, adapterContext);
      if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', 'remote workflow definition is invalid');
      checkCompatibility(result.value);
      const canonical = canonicalizeDefinition(definition);
      const hash = await sha256Hex(canonical);
      if (hash !== entry.contentHash) throw new RegistryError('REGISTRY_HASH_MISMATCH', 'workflow content hash does not match index');
      const signatureResponse = await fetchSafe(`${baseUrl.replace(/\/$/, '')}/registry/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(version)}.sig`);
      const signature = (await signatureResponse.text()).trim();
      const key = keyring.find((item) => item.registryId === index.registryId);
      if (!key || !(await verifySignedPayload(canonical, signature, key, (deps.now ?? Date.now)()))) throw new RegistryError('REGISTRY_SIGNATURE_INVALID', 'workflow definition signature is invalid');
      const record: RegistryRecord = { workflowId, version, contentHash: hash, source: 'remote', trust: 'trusted', definitionJson: canonical, installedAt: (deps.now ?? Date.now)() };
      await deps.repository.upsert(record);
      return record;
    },
  };
}
