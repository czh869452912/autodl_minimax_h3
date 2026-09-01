export type RegistrySource = 'builtin' | 'local-import' | 'remote';
export type RegistryTrust = 'builtin' | 'trusted' | 'untrusted-local';
export type RegistryRecord = { workflowId: string; version: string; contentHash: string; source: RegistrySource; trust: RegistryTrust; definitionJson: string; installedAt: number; repository?: string; ref?: string; commit?: string };
export type RegistryKey = { registryId: string; publicKey: string; status: 'active' | 'revoked'; validFrom?: number; validUntil?: number };
export type RegistryIndexEntry = { workflowId: string; version: string; contentHash: string; adapter: string; operation: string; signature: string; minAppVersion?: string; deprecated?: boolean; changelog?: string };
export type RegistryIndex = { registryId: string; entries: RegistryIndexEntry[]; signature: string };
export type WorkflowRegistry = {
  upsert(record: RegistryRecord): Promise<void>;
  installAndActivate?(record: RegistryRecord): Promise<void>;
  get(workflowId: string, version: string): Promise<RegistryRecord | undefined>;
  list(options?: { workflowId?: string; source?: RegistrySource }): Promise<RegistryRecord[]>;
  setActive(workflowId: string, version: string, contentHash: string): Promise<void>;
  getActive(workflowId: string): Promise<RegistryRecord | undefined>;
  rollback(workflowId: string): Promise<void>;
  removeUnreferenced(keepHashes: Set<string>): Promise<void>;
};
