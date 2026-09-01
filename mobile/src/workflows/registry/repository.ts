import type { SQLiteDatabase } from 'expo-sqlite';
import type { RegistryRecord, WorkflowRegistry } from './types';
import { ensureAppDatabase } from '../../storage/database';

type Row = { workflow_id: string; version: string; content_hash: string; source: string; trust: string; definition_json: string; installed_at: number; repository?: string; ref?: string; commit?: string };
type ActiveRow = { workflow_id: string; version: string; content_hash: string; previous_version?: string; previous_hash?: string };

export function createWorkflowRegistry(db: SQLiteDatabase | undefined): WorkflowRegistry {
  const memory = new Map<string, RegistryRecord>();
  const active = new Map<string, ActiveRow>();
  const key = (id: string, version: string) => `${id}\u0000${version}`;
  if (db) {
    ensureAppDatabase(db);
    db.execSync('CREATE TABLE IF NOT EXISTS workflow_registry (workflow_id TEXT NOT NULL, version TEXT NOT NULL, content_hash TEXT NOT NULL, source TEXT NOT NULL, trust TEXT NOT NULL, definition_json TEXT NOT NULL, installed_at INTEGER NOT NULL, PRIMARY KEY (workflow_id, version));');
    db.execSync('CREATE TABLE IF NOT EXISTS workflow_registry_active (workflow_id TEXT PRIMARY KEY NOT NULL, version TEXT NOT NULL, content_hash TEXT NOT NULL, previous_version TEXT, previous_hash TEXT);');
  }
  const fromRow = (row: Row): RegistryRecord => ({ workflowId: row.workflow_id, version: row.version, contentHash: row.content_hash, source: row.source as RegistryRecord['source'], trust: row.trust as RegistryRecord['trust'], definitionJson: row.definition_json, installedAt: Number(row.installed_at), repository: row.repository, ref: row.ref, commit: row.commit });
  const get = async (workflowId: string, version: string) => {
    if (!db) return memory.get(key(workflowId, version));
    const row = db.getFirstSync<Row>('SELECT * FROM workflow_registry WHERE workflow_id = ? AND version = ? LIMIT 1', workflowId, version) as Row | null | undefined;
    return row ? fromRow(row) : undefined;
  };
  return {
    async upsert(record) {
      const existing = await get(record.workflowId, record.version);
      if (existing && existing.contentHash !== record.contentHash) throw new Error('workflow definition is immutable');
      if (existing) return;
      if (!db) memory.set(key(record.workflowId, record.version), record);
      else db.runSync('INSERT INTO workflow_registry (workflow_id,version,content_hash,source,trust,definition_json,installed_at) VALUES (?,?,?,?,?,?,?)', record.workflowId, record.version, record.contentHash, record.source, record.trust, record.definitionJson, record.installedAt);
    },
    get,
    async list(options = {}) {
      if (!db) return Array.from(memory.values()).filter((item) => (!options.workflowId || item.workflowId === options.workflowId) && (!options.source || item.source === options.source));
      const rows = db.getAllSync<Row>('SELECT * FROM workflow_registry ORDER BY workflow_id, version') as Row[];
      return rows.map(fromRow).filter((item) => (!options.workflowId || item.workflowId === options.workflowId) && (!options.source || item.source === options.source));
    },
    async setActive(workflowId, version, contentHash) {
      const definition = await get(workflowId, version);
      if (!definition || definition.contentHash !== contentHash) throw new Error('workflow definition not found');
      const previous = db ? db.getFirstSync<ActiveRow>('SELECT * FROM workflow_registry_active WHERE workflow_id = ? LIMIT 1', workflowId) as ActiveRow | null : active.get(workflowId);
      const row = { workflow_id: workflowId, version, content_hash: contentHash, previous_version: previous?.version, previous_hash: previous?.content_hash };
      if (!db) active.set(workflowId, row); else db.runSync('INSERT OR REPLACE INTO workflow_registry_active (workflow_id,version,content_hash,previous_version,previous_hash) VALUES (?,?,?,?,?)', workflowId, version, contentHash, row.previous_version ?? null, row.previous_hash ?? null);
    },
    async getActive(workflowId) {
      const row = db ? db.getFirstSync<ActiveRow>('SELECT * FROM workflow_registry_active WHERE workflow_id = ? LIMIT 1', workflowId) as ActiveRow | null : active.get(workflowId);
      if (!row) return undefined;
      return get(workflowId, row.version);
    },
    async rollback(workflowId) {
      const row = db ? db.getFirstSync<ActiveRow>('SELECT * FROM workflow_registry_active WHERE workflow_id = ? LIMIT 1', workflowId) as ActiveRow | null : active.get(workflowId);
      if (!row?.previous_version || !row.previous_hash) throw new Error('no previous workflow definition');
      await this.setActive(workflowId, row.previous_version, row.previous_hash);
    },
    async removeUnreferenced(keepHashes) {
      const records = await this.list();
      const current = new Set((await Promise.all(records.map(async (item) => (await this.getActive(item.workflowId))?.contentHash))).filter(Boolean));
      for (const item of records) if (!keepHashes.has(item.contentHash) && !current.has(item.contentHash)) {
        if (!db) memory.delete(key(item.workflowId, item.version)); else db.runSync('DELETE FROM workflow_registry WHERE workflow_id = ? AND version = ?', item.workflowId, item.version);
      }
    },
  };
}
