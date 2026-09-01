import type { SQLiteDatabase } from 'expo-sqlite';
import type { RegistryRecord, WorkflowRegistry } from './types';
import { assertAppDatabaseWritable, ensureAppDatabase } from '../../storage/database';

type Row = { workflow_id: string; version: string; content_hash: string; source: string; trust: string; definition_json: string; installed_at: number; repository?: string; ref?: string; commit_sha?: string };
type ActiveRow = { workflow_id: string; version: string; content_hash: string; previous_version?: string; previous_hash?: string };

export function createWorkflowRegistry(db: SQLiteDatabase | undefined): WorkflowRegistry {
  const memory = new Map<string, RegistryRecord>();
  const active = new Map<string, ActiveRow>();
  const key = (id: string, version: string) => `${id}\u0000${version}`;
  if (db) {
    ensureAppDatabase(db);
  }
  const fromRow = (row: Row): RegistryRecord => ({ workflowId: row.workflow_id, version: row.version, contentHash: row.content_hash, source: row.source as RegistryRecord['source'], trust: row.trust as RegistryRecord['trust'], definitionJson: row.definition_json, installedAt: Number(row.installed_at), repository: row.repository, ref: row.ref, commit: row.commit_sha });
  const get = async (workflowId: string, version: string) => {
    if (!db) return memory.get(key(workflowId, version));
    const row = db.getFirstSync<Row>('SELECT * FROM workflow_registry WHERE workflow_id = ? AND version = ? LIMIT 1', workflowId, version) as Row | null | undefined;
    return row ? fromRow(row) : undefined;
  };
  return {
    async upsert(record) {
      assertAppDatabaseWritable(db);
      const existing = await get(record.workflowId, record.version);
      if (existing && existing.contentHash !== record.contentHash) throw new Error('workflow definition is immutable');
      if (existing) return;
      if (!db) memory.set(key(record.workflowId, record.version), record);
      else db.runSync('INSERT INTO workflow_registry (workflow_id,version,content_hash,source,trust,definition_json,installed_at,repository,ref,commit_sha) VALUES (?,?,?,?,?,?,?,?,?,?)', record.workflowId, record.version, record.contentHash, record.source, record.trust, record.definitionJson, record.installedAt, record.repository ?? null, record.ref ?? null, record.commit ?? null);
    },
    async installAndActivate(record) {
      assertAppDatabaseWritable(db);
      if (!db) {
        const existing = memory.get(key(record.workflowId, record.version));
        if (existing && existing.contentHash !== record.contentHash) throw new Error('workflow definition is immutable');
        if (!existing) memory.set(key(record.workflowId, record.version), record);
        const previous = active.get(record.workflowId);
        active.set(record.workflowId, { workflow_id: record.workflowId, version: record.version, content_hash: record.contentHash, previous_version: previous?.version, previous_hash: previous?.content_hash });
        return;
      }
      const transaction = (db as unknown as { withTransactionSync?: (fn: () => void) => void }).withTransactionSync;
      const install = () => {
        const existing = db.getFirstSync<Row>('SELECT * FROM workflow_registry WHERE workflow_id = ? AND version = ? LIMIT 1', record.workflowId, record.version) as Row | null | undefined;
        if (existing && existing.content_hash !== record.contentHash) throw new Error('workflow definition is immutable');
        if (!existing) db.runSync('INSERT INTO workflow_registry (workflow_id,version,content_hash,source,trust,definition_json,installed_at,repository,ref,commit_sha) VALUES (?,?,?,?,?,?,?,?,?,?)', record.workflowId, record.version, record.contentHash, record.source, record.trust, record.definitionJson, record.installedAt, record.repository ?? null, record.ref ?? null, record.commit ?? null);
        const previous = db.getFirstSync<ActiveRow>('SELECT * FROM workflow_registry_active WHERE workflow_id = ? LIMIT 1', record.workflowId) as ActiveRow | null;
        db.runSync('INSERT OR REPLACE INTO workflow_registry_active (workflow_id,version,content_hash,previous_version,previous_hash) VALUES (?,?,?,?,?)', record.workflowId, record.version, record.contentHash, previous?.version ?? null, previous?.content_hash ?? null);
      };
      if (transaction) transaction.call(db, install);
      else { db.execSync('BEGIN'); try { install(); db.execSync('COMMIT'); } catch (error) { try { db.execSync('ROLLBACK'); } catch { /* best effort */ } throw error; } }
    },
    get,
    async list(options = {}) {
      if (!db) return Array.from(memory.values()).filter((item) => (!options.workflowId || item.workflowId === options.workflowId) && (!options.source || item.source === options.source));
      const rows = db.getAllSync<Row>('SELECT * FROM workflow_registry ORDER BY workflow_id, version') as Row[];
      return rows.map(fromRow).filter((item) => (!options.workflowId || item.workflowId === options.workflowId) && (!options.source || item.source === options.source));
    },
    async setActive(workflowId, version, contentHash) {
      assertAppDatabaseWritable(db);
      const definition = await get(workflowId, version);
      if (!definition || definition.contentHash !== contentHash) throw new Error('workflow definition not found');
      const previous = db ? db.getFirstSync<ActiveRow>('SELECT * FROM workflow_registry_active WHERE workflow_id = ? LIMIT 1', workflowId) as ActiveRow | null : active.get(workflowId);
      const row = { workflow_id: workflowId, version, content_hash: contentHash, previous_version: previous?.version, previous_hash: previous?.content_hash };
      if (!db) active.set(workflowId, row); else db.runSync('INSERT OR REPLACE INTO workflow_registry_active (workflow_id,version,content_hash,previous_version,previous_hash) VALUES (?,?,?,?,?)', workflowId, version, contentHash, row.previous_version ?? null, row.previous_hash ?? null);
    },
    async getActive(workflowId) {
      const row = db ? db.getFirstSync<ActiveRow>('SELECT * FROM workflow_registry_active WHERE workflow_id = ? LIMIT 1', workflowId) as ActiveRow | null : active.get(workflowId);
      if (!row) return undefined;
      const current = await get(workflowId, row.version);
      if (current && current.contentHash === row.content_hash) return current;
      if (row.previous_version && row.previous_hash) {
        const previous = await get(workflowId, row.previous_version);
        if (previous && previous.contentHash === row.previous_hash) return previous;
      }
      return undefined;
    },
    async rollback(workflowId) {
      assertAppDatabaseWritable(db);
      const row = db ? db.getFirstSync<ActiveRow>('SELECT * FROM workflow_registry_active WHERE workflow_id = ? LIMIT 1', workflowId) as ActiveRow | null : active.get(workflowId);
      if (!row?.previous_version || !row.previous_hash) throw new Error('no previous workflow definition');
      await this.setActive(workflowId, row.previous_version, row.previous_hash);
    },
    async removeUnreferenced(keepHashes) {
      assertAppDatabaseWritable(db);
      const records = await this.list();
      const activeRows = new Map<string, ActiveRow>();
      for (const item of records) { const row = db ? db.getFirstSync<ActiveRow>('SELECT * FROM workflow_registry_active WHERE workflow_id = ? LIMIT 1', item.workflowId) as ActiveRow | null : active.get(item.workflowId); if (row) activeRows.set(item.workflowId, row); }
      const referenced = new Set<string>([...activeRows.values()].flatMap((row) => [row.content_hash, row.previous_hash].filter((hash): hash is string => Boolean(hash))));
      for (const item of records) if (!keepHashes.has(item.contentHash) && !referenced.has(item.contentHash)) {
        if (!db) memory.delete(key(item.workflowId, item.version)); else db.runSync('DELETE FROM workflow_registry WHERE workflow_id = ? AND version = ?', item.workflowId, item.version);
      }
    },
  };
}
