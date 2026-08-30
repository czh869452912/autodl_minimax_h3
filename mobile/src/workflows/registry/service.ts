import { canonicalizeDefinition } from './canonicalize';
import { parseWorkflowImport } from './import';
import { sha256Hex } from './crypto';
import { verifySignedPayload } from './trust';
import type { WorkflowDefinition, PlatformAdapterManifest } from '../schema/types';
import type { RegistryIndex, RegistryRecord, RegistryKey, WorkflowRegistry, RegistrySource } from './types';
import { validateWorkflowDefinition } from '../schema/validator';

export class RegistryError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = 'RegistryError'; } }
type Dependencies = { repository: WorkflowRegistry; adapters: Array<Pick<PlatformAdapterManifest, 'id' | 'operations'>>; appVersion: string; fetch?: typeof fetch; keyring?: RegistryKey[]; allowDomains?: string[]; now?: () => number };
const rank: Record<RegistrySource, number> = { builtin: 3, 'local-import': 2, remote: 1 };

function allowedUrl(value: string, allowDomains: string[]): boolean { try { const url = new URL(value); return url.protocol === 'https:' && allowDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)); } catch { return false; } }

export function createWorkflowRegistryService(deps: Dependencies) {
  const fetcher = deps.fetch ?? fetch;
  const keyring = deps.keyring ?? [];
  const adapterContext = { adapters: deps.adapters.map((adapter) => ({ id: adapter.id, operations: adapter.operations })) };
  return {
    async discoverWorkflows(): Promise<RegistryRecord[]> {
      const records = await deps.repository.list();
      const selected = new Map<string, RegistryRecord>();
      for (const record of records) { const current = selected.get(record.workflowId); if (!current || rank[record.source] > rank[current.source]) selected.set(record.workflowId, record); }
      return Array.from(selected.values()).sort((a, b) => a.workflowId.localeCompare(b.workflowId));
    },
    async importWorkflow(text: string, format: 'json' | 'yaml'): Promise<RegistryRecord> {
      const definition = parseWorkflowImport(text, format);
      const result = validateWorkflowDefinition(definition, adapterContext);
      if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', result.errors.map((error) => error.message).join('; '));
      const canonical = canonicalizeDefinition(definition);
      const record: RegistryRecord = { workflowId: result.value.id, version: result.value.version, contentHash: await sha256Hex(canonical), source: 'local-import', trust: 'untrusted-local', definitionJson: canonical, installedAt: (deps.now ?? Date.now)() };
      await deps.repository.upsert(record);
      return record;
    },
    async activateBuiltin(definition: WorkflowDefinition): Promise<void> {
      const result = validateWorkflowDefinition(definition, adapterContext);
      if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', 'builtin definition is invalid');
      const canonical = canonicalizeDefinition(definition);
      await deps.repository.upsert({ workflowId: definition.id, version: definition.version, contentHash: await sha256Hex(canonical), source: 'builtin', trust: 'builtin', definitionJson: canonical, installedAt: (deps.now ?? Date.now)() });
    },
    async syncRemoteIndex(url: string): Promise<RegistryIndex> {
      if (!allowedUrl(url, deps.allowDomains ?? [])) throw new RegistryError('REGISTRY_DOMAIN_REJECTED', 'registry URL is not allowlisted HTTPS');
      const response = await fetcher(url);
      const body = await response.json() as RegistryIndex;
      const key = keyring.find((item) => item.registryId === body.registryId);
      if (!key || !(await verifySignedPayload(canonicalizeDefinition({ registryId: body.registryId, entries: body.entries }), body.signature, key, (deps.now ?? Date.now)()))) throw new RegistryError('REGISTRY_SIGNATURE_INVALID', 'registry index signature is invalid');
      return body;
    },
    async fetchAndActivate(workflowId: string, version: string, baseUrl: string): Promise<RegistryRecord> {
      const index = await this.syncRemoteIndex(`${baseUrl.replace(/\/$/, '')}/registry/index.json`);
      const entry = index.entries.find((item) => item.workflowId === workflowId && item.version === version);
      if (!entry) throw new RegistryError('REGISTRY_NOT_FOUND', 'workflow version is not listed');
      const response = await fetcher(`${baseUrl.replace(/\/$/, '')}/registry/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(version)}.json`);
      const definition = await response.json();
      const result = validateWorkflowDefinition(definition, adapterContext);
      if (!result.ok) throw new RegistryError('REGISTRY_SCHEMA_INVALID', 'remote workflow definition is invalid');
      const canonical = canonicalizeDefinition(definition);
      const hash = await sha256Hex(canonical);
      if (hash !== entry.contentHash) throw new RegistryError('REGISTRY_HASH_MISMATCH', 'workflow content hash does not match index');
      const signatureResponse = await fetcher(`${baseUrl.replace(/\/$/, '')}/registry/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(version)}.sig`);
      const signature = (await signatureResponse.text()).trim();
      const key = keyring.find((item) => item.registryId === index.registryId);
      if (!key || !(await verifySignedPayload(canonical, signature, key, (deps.now ?? Date.now)()))) throw new RegistryError('REGISTRY_SIGNATURE_INVALID', 'workflow definition signature is invalid');
      const record: RegistryRecord = { workflowId, version, contentHash: hash, source: 'remote', trust: 'trusted', definitionJson: canonical, installedAt: (deps.now ?? Date.now)() };
      await deps.repository.upsert(record);
      return record;
    },
  };
}
