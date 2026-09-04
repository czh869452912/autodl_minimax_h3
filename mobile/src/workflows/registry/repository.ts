import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  AppliedRegistryRelease,
  BuiltinReleaseBatch,
  RegistryActivePointer,
  RegistryRecord,
  WorkflowRegistry,
} from './types';
import type { WorkflowIdentityScheme } from './identity';
import { assertAppDatabaseWritable } from '../../storage/database';
import { markRecovery } from '../../storage/recovery';
import { RegistryReleaseError } from './releaseManifest';

type Row = { workflow_id: string; version: string; content_hash: string; hash_scheme: string; source: string; trust: string; definition_json: string; installed_at: number; repository?: string; ref?: string; commit_sha?: string };
type ActiveRow = { workflow_id: string; version: string; content_hash: string; previous_version?: string; previous_hash?: string };
type ReleaseRow = { release_id: string; manifest_hash: string; applied_at: number };

export function createWorkflowRegistry(db: SQLiteDatabase | undefined): WorkflowRegistry {
  const memory = new Map<string, RegistryRecord>();
  const active = new Map<string, ActiveRow>();
  const appliedReleases = new Map<string, AppliedRegistryRelease>();
  const key = (id: string, version: string) => `${id}\u0000${version}`;
  const fromRow = (row: Row): RegistryRecord => ({ workflowId: row.workflow_id, version: row.version, contentHash: row.content_hash, hashScheme: row.hash_scheme as WorkflowIdentityScheme, source: row.source as RegistryRecord['source'], trust: row.trust as RegistryRecord['trust'], definitionJson: row.definition_json, installedAt: Number(row.installed_at), repository: row.repository, ref: row.ref, commit: row.commit_sha });
  const get = async (workflowId: string, version: string) => {
    if (!db) return memory.get(key(workflowId, version));
    const row = db.getFirstSync<Row>('SELECT * FROM workflow_registry WHERE workflow_id = ? AND version = ? LIMIT 1', workflowId, version) as Row | null | undefined;
    return row ? fromRow(row) : undefined;
  };
  const activePointer = (row: ActiveRow): RegistryActivePointer => ({
    workflowId: row.workflow_id,
    version: row.version,
    contentHash: row.content_hash,
    previousVersion: row.previous_version ?? undefined,
    previousHash: row.previous_hash ?? undefined,
  });

  const validateBatch = (batch: BuiltinReleaseBatch, lookup: (workflowId: string, version: string) => RegistryRecord | undefined) => {
    const coordinates = new Set<string>();
    for (const record of batch.records) {
      const coordinate = key(record.workflowId, record.version);
      if (coordinates.has(coordinate)) throw new RegistryReleaseError('REGISTRY_RELEASE_DUPLICATE_COORDINATE');
      coordinates.add(coordinate);
      const existing = lookup(record.workflowId, record.version);
      if (existing && (existing.contentHash !== record.contentHash || existing.hashScheme !== record.hashScheme)) {
        throw new RegistryReleaseError('REGISTRY_IMMUTABLE_VERSION_CONFLICT');
      }
    }
    for (const activation of batch.activations) {
      const target = lookup(activation.workflowId, activation.version)
        ?? batch.records.find((record) => record.workflowId === activation.workflowId && record.version === activation.version);
      if (!target || target.contentHash !== activation.contentHash) {
        throw new RegistryReleaseError('REGISTRY_RELEASE_TARGET_MISSING');
      }
    }
  };

  const applySqlBatch = (batch: BuiltinReleaseBatch) => {
    if (!db) return;
    const applied = db.getFirstSync<ReleaseRow>(
      'SELECT release_id,manifest_hash,applied_at FROM workflow_registry_releases WHERE release_id = ? LIMIT 1',
      batch.releaseId,
    );
    if (applied?.manifest_hash === batch.manifestHash) return;
    if (applied) throw new RegistryReleaseError('REGISTRY_RELEASE_ID_REUSED');
    const lookup = (workflowId: string, recordVersion: string) => {
      const row = db.getFirstSync<Row>(
        'SELECT * FROM workflow_registry WHERE workflow_id = ? AND version = ? LIMIT 1',
        workflowId,
        recordVersion,
      );
      return row ? fromRow(row) : undefined;
    };
    validateBatch(batch, lookup);
    for (const record of batch.records) {
      if (lookup(record.workflowId, record.version)) continue;
      db.runSync(
        'INSERT INTO workflow_registry (workflow_id,version,content_hash,hash_scheme,source,trust,definition_json,installed_at,repository,ref,commit_sha) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        record.workflowId, record.version, record.contentHash, record.hashScheme, record.source, record.trust,
        record.definitionJson, record.installedAt, record.repository ?? null, record.ref ?? null, record.commit ?? null,
      );
    }
    for (const activation of batch.activations) {
      const previous = db.getFirstSync<ActiveRow>(
        'SELECT * FROM workflow_registry_active WHERE workflow_id = ? LIMIT 1',
        activation.workflowId,
      );
      if (previous?.version === activation.version && previous.content_hash === activation.contentHash) continue;
      db.runSync(
        'INSERT OR REPLACE INTO workflow_registry_active (workflow_id,version,content_hash,previous_version,previous_hash) VALUES (?,?,?,?,?)',
        activation.workflowId, activation.version, activation.contentHash,
        previous?.version ?? null, previous?.content_hash ?? null,
      );
    }
    db.runSync(
      'INSERT INTO workflow_registry_releases (release_id,manifest_hash,applied_at) VALUES (?,?,?)',
      batch.releaseId, batch.manifestHash, batch.appliedAt,
    );
  };

  const verifyRollback = (batch: BuiltinReleaseBatch, cause: unknown): never => {
    if (!db) throw cause;
    try {
      const integrity = db.getFirstSync<{ integrity_check: string }>('PRAGMA integrity_check');
      if (integrity?.integrity_check !== 'ok') throw new Error('integrity check failed');
    } catch (recoveryCause) {
      try { markRecovery(db, 'REGISTRY_RELEASE_RECOVERY_REQUIRED', batch.appliedAt); } catch { /* remain failed closed */ }
      throw new RegistryReleaseError('REGISTRY_RELEASE_RECOVERY_REQUIRED', { cause: recoveryCause });
    }
    if (cause instanceof RegistryReleaseError) throw cause;
    throw new RegistryReleaseError('REGISTRY_RELEASE_TRANSACTION_ROLLED_BACK', { cause });
  };
  return {
    async upsert(record) {
      assertAppDatabaseWritable(db);
      const existing = await get(record.workflowId, record.version);
      if (existing && (existing.contentHash !== record.contentHash || existing.hashScheme !== record.hashScheme)) throw new Error('workflow definition is immutable');
      if (existing) return;
      if (!db) memory.set(key(record.workflowId, record.version), record);
      else db.runSync('INSERT INTO workflow_registry (workflow_id,version,content_hash,hash_scheme,source,trust,definition_json,installed_at,repository,ref,commit_sha) VALUES (?,?,?,?,?,?,?,?,?,?,?)', record.workflowId, record.version, record.contentHash, record.hashScheme, record.source, record.trust, record.definitionJson, record.installedAt, record.repository ?? null, record.ref ?? null, record.commit ?? null);
    },
    async installAndActivate(record) {
      assertAppDatabaseWritable(db);
      if (!db) {
        const existing = memory.get(key(record.workflowId, record.version));
        if (existing && (existing.contentHash !== record.contentHash || existing.hashScheme !== record.hashScheme)) throw new Error('workflow definition is immutable');
        if (!existing) memory.set(key(record.workflowId, record.version), record);
        const previous = active.get(record.workflowId);
        active.set(record.workflowId, { workflow_id: record.workflowId, version: record.version, content_hash: record.contentHash, previous_version: previous?.version, previous_hash: previous?.content_hash });
        return;
      }
      const transaction = (db as unknown as { withTransactionSync?: (fn: () => void) => void }).withTransactionSync;
      const install = () => {
        const existing = db.getFirstSync<Row>('SELECT * FROM workflow_registry WHERE workflow_id = ? AND version = ? LIMIT 1', record.workflowId, record.version) as Row | null | undefined;
        if (existing && (existing.content_hash !== record.contentHash || existing.hash_scheme !== record.hashScheme)) throw new Error('workflow definition is immutable');
        if (!existing) db.runSync('INSERT INTO workflow_registry (workflow_id,version,content_hash,hash_scheme,source,trust,definition_json,installed_at,repository,ref,commit_sha) VALUES (?,?,?,?,?,?,?,?,?,?,?)', record.workflowId, record.version, record.contentHash, record.hashScheme, record.source, record.trust, record.definitionJson, record.installedAt, record.repository ?? null, record.ref ?? null, record.commit ?? null);
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
    async getActivePointer(workflowId) {
      const row = db
        ? db.getFirstSync<ActiveRow>('SELECT * FROM workflow_registry_active WHERE workflow_id = ? LIMIT 1', workflowId)
        : active.get(workflowId);
      return row ? activePointer(row) : undefined;
    },
    async getAppliedRelease(releaseId) {
      if (!db) return appliedReleases.get(releaseId);
      const row = db.getFirstSync<ReleaseRow>(
        'SELECT release_id,manifest_hash,applied_at FROM workflow_registry_releases WHERE release_id = ? LIMIT 1',
        releaseId,
      );
      return row ? { releaseId: row.release_id, manifestHash: row.manifest_hash, appliedAt: Number(row.applied_at) } : undefined;
    },
    async applyBuiltinRelease(batch) {
      assertAppDatabaseWritable(db);
      if (!db) {
        const applied = appliedReleases.get(batch.releaseId);
        if (applied?.manifestHash === batch.manifestHash) return;
        if (applied) throw new RegistryReleaseError('REGISTRY_RELEASE_ID_REUSED');
        validateBatch(batch, (workflowId, recordVersion) => memory.get(key(workflowId, recordVersion)));
        for (const record of batch.records) if (!memory.has(key(record.workflowId, record.version))) {
          memory.set(key(record.workflowId, record.version), record);
        }
        for (const activation of batch.activations) {
          const previous = active.get(activation.workflowId);
          if (previous?.version === activation.version && previous.content_hash === activation.contentHash) continue;
          active.set(activation.workflowId, {
            workflow_id: activation.workflowId,
            version: activation.version,
            content_hash: activation.contentHash,
            previous_version: previous?.version,
            previous_hash: previous?.content_hash,
          });
        }
        appliedReleases.set(batch.releaseId, {
          releaseId: batch.releaseId,
          manifestHash: batch.manifestHash,
          appliedAt: batch.appliedAt,
        });
        return;
      }
      const transaction = db.withTransactionSync;
      if (typeof transaction === 'function') {
        try {
          transaction.call(db, () => applySqlBatch(batch));
        } catch (cause) {
          verifyRollback(batch, cause);
        }
        return;
      }
      db.execSync('BEGIN');
      try {
        applySqlBatch(batch);
        db.execSync('COMMIT');
      } catch (cause) {
        try {
          db.execSync('ROLLBACK');
        } catch (rollbackCause) {
          try { markRecovery(db, 'REGISTRY_RELEASE_RECOVERY_REQUIRED', batch.appliedAt); } catch { /* remain failed closed */ }
          throw new RegistryReleaseError('REGISTRY_RELEASE_RECOVERY_REQUIRED', { cause: rollbackCause });
        }
        verifyRollback(batch, cause);
      }
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
