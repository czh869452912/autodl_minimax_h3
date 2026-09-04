import type { SQLiteDatabase } from 'expo-sqlite';
import type { NormalizedError } from '../../jobs/types';
import { assertAppDatabaseWritable } from '../../storage/database';
import type { EnqueueOperation, OperationKind, OperationState, WorkflowOperation } from './types';

type OperationRow = {
  id: string;
  kind: OperationKind;
  job_id?: string | null;
  idempotency_key: string;
  payload_json: string;
  state: OperationState;
  attempt: number;
  next_retry_at: number;
  lease_owner?: string | null;
  lease_expires_at?: number | null;
  last_error_json?: string | null;
  created_at: number;
  updated_at: number;
};

export type PendingSummary = {
  remainingDue: number;
  remainingScheduled: number;
  nextWakeAt?: number;
};

function parseRecord(source: string | null | undefined): Record<string, unknown> {
  if (!source) return {};
  try {
    const value = JSON.parse(source);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function parseError(source: string | null | undefined): NormalizedError | undefined {
  if (!source) return undefined;
  try {
    const value = JSON.parse(source) as NormalizedError;
    return typeof value?.code === 'string' && typeof value?.message === 'string' ? value : undefined;
  } catch { return undefined; }
}

function mapRow(row: OperationRow): WorkflowOperation {
  return {
    id: row.id,
    kind: row.kind,
    ...(row.job_id ? { jobId: row.job_id } : {}),
    idempotencyKey: row.idempotency_key,
    payload: parseRecord(row.payload_json),
    state: row.state,
    attempt: Number(row.attempt),
    nextRetryAt: Number(row.next_retry_at),
    ...(row.lease_owner ? { leaseOwner: row.lease_owner } : {}),
    ...(row.lease_expires_at == null ? {} : { leaseExpiresAt: Number(row.lease_expires_at) }),
    ...(parseError(row.last_error_json) ? { lastError: parseError(row.last_error_json) } : {}),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function changes(result: unknown): number {
  const value = (result as { changes?: number | bigint } | undefined)?.changes;
  return value == null ? 0 : Number(value);
}

function transaction<T>(db: SQLiteDatabase, work: () => T): T {
  if (typeof db.withTransactionSync === 'function') {
    let result!: T;
    db.withTransactionSync(() => { result = work(); });
    return result;
  }
  db.execSync('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.execSync('COMMIT');
    return result;
  } catch (error) {
    try { db.execSync('ROLLBACK'); } catch { /* best effort */ }
    throw error;
  }
}

export function createOperationRepository(db: SQLiteDatabase) {
  const get = (id: string): WorkflowOperation | undefined => {
    const row = db.getFirstSync<OperationRow>('SELECT * FROM workflow_operations WHERE id = ? LIMIT 1', id);
    return row ? mapRow(row) : undefined;
  };
  const enqueue = (input: EnqueueOperation): WorkflowOperation => {
    assertAppDatabaseWritable(db);
    db.runSync(
      "INSERT OR IGNORE INTO workflow_operations (id,kind,job_id,idempotency_key,payload_json,state,attempt,next_retry_at,created_at,updated_at) VALUES (?,?,?,?,?,'PENDING',0,?,?,?)",
      input.id, input.kind, input.jobId ?? null, input.idempotencyKey, JSON.stringify(input.payload),
      input.nextRetryAt ?? input.now, input.now, input.now,
    );
    const row = db.getFirstSync<OperationRow>(
      'SELECT * FROM workflow_operations WHERE kind = ? AND idempotency_key = ? LIMIT 1',
      input.kind,
      input.idempotencyKey,
    );
    if (!row) throw new Error('operation enqueue failed');
    return mapRow(row);
  };
  return {
    enqueue,
    get,
    list(kind?: OperationKind): WorkflowOperation[] {
      const rows = kind
        ? db.getAllSync<OperationRow>('SELECT * FROM workflow_operations WHERE kind = ? ORDER BY created_at ASC, id ASC', kind)
        : db.getAllSync<OperationRow>('SELECT * FROM workflow_operations ORDER BY created_at ASC, id ASC');
      return rows.map(mapRow);
    },
    listDue(options: { kind: OperationKind; now: number; limit: number }): WorkflowOperation[] {
      const limit = Math.max(0, Math.floor(options.limit));
      if (limit === 0) return [];
      return db.getAllSync<OperationRow>(
        "SELECT * FROM workflow_operations WHERE kind = ? AND state = 'PENDING' AND next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?) ORDER BY next_retry_at ASC, created_at ASC, id ASC LIMIT ?",
        options.kind, options.now, options.now, limit,
      ).map(mapRow);
    },
    pendingSummary(options: { now: number; jobIds?: string[] }): PendingSummary {
      if (options.jobIds && options.jobIds.length === 0) return { remainingDue: 0, remainingScheduled: 0 };
      const scope = options.jobIds ? ` AND job_id IN (${options.jobIds.map(() => '?').join(',')})` : '';
      const row = db.getFirstSync<{
        remaining_due: number | null;
        remaining_scheduled: number | null;
        next_wake_at: number | null;
      }>(
        `SELECT
          COALESCE(SUM(CASE WHEN next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?) THEN 1 ELSE 0 END), 0) AS remaining_due,
          COALESCE(SUM(CASE WHEN NOT (next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)) THEN 1 ELSE 0 END), 0) AS remaining_scheduled,
          MIN(CASE WHEN NOT (next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)) THEN
            CASE WHEN lease_expires_at IS NOT NULL AND lease_expires_at > next_retry_at THEN lease_expires_at ELSE next_retry_at END
          END) AS next_wake_at
        FROM workflow_operations WHERE state = 'PENDING'${scope}`,
        options.now, options.now, options.now, options.now, options.now, options.now, ...(options.jobIds ?? []),
      );
      const summary: PendingSummary = {
        remainingDue: Number(row?.remaining_due ?? 0),
        remainingScheduled: Number(row?.remaining_scheduled ?? 0),
      };
      if (row?.next_wake_at != null) summary.nextWakeAt = Number(row.next_wake_at);
      return summary;
    },
    countOutstanding(jobIds: string[]): number {
      if (jobIds.length === 0) return 0;
      const placeholders = jobIds.map(() => '?').join(',');
      const row = db.getFirstSync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM workflow_operations WHERE state IN ('PENDING','CLAIMED') AND job_id IN (${placeholders})`,
        ...jobIds,
      );
      return Number(row?.count ?? 0);
    },
    expediteRetryableNetwork(jobIds: string[], now: number): number {
      if (jobIds.length === 0) return 0;
      assertAppDatabaseWritable(db);
      const placeholders = jobIds.map(() => '?').join(',');
      const result = db.runSync(
        `UPDATE workflow_operations SET next_retry_at = ?, updated_at = ?
        WHERE state = 'PENDING' AND next_retry_at > ? AND job_id IN (${placeholders})
          AND json_extract(last_error_json, '$.retryable') = 1
          AND (
            (kind = 'STATUS_SYNC' AND (
              json_extract(last_error_json, '$.code') LIKE '%_STATUS_NETWORK'
              OR json_extract(last_error_json, '$.code') LIKE '%_STATUS_TIMEOUT'
            ))
            OR (kind = 'ARTIFACT_DOWNLOAD' AND json_extract(last_error_json, '$.code') IN (
              'ARTIFACT_NETWORK', 'ARTIFACT_CONNECT_TIMEOUT', 'ARTIFACT_IDLE_TIMEOUT'
            ))
          )`,
        now, now, now, ...jobIds,
      );
      return changes(result);
    },
    claimById(id: string, owner: string, now: number, leaseMs: number): WorkflowOperation | undefined {
      assertAppDatabaseWritable(db);
      const result = db.runSync(
        "UPDATE workflow_operations SET state = 'CLAIMED', lease_owner = ?, lease_expires_at = ?, attempt = attempt + 1, updated_at = ? WHERE id = ? AND state = 'PENDING' AND next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)",
        owner, now + Math.max(1, leaseMs), now, id, now, now,
      );
      return changes(result) === 1 ? get(id) : undefined;
    },
    claimDue(options: { kind: OperationKind; owner: string; now: number; leaseMs: number; limit: number }): WorkflowOperation[] {
      assertAppDatabaseWritable(db);
      return transaction(db, () => {
        const limit = Math.max(0, Math.floor(options.limit));
        if (limit === 0) return [];
        const candidates = db.getAllSync<{ id: string }>(
          "SELECT id FROM workflow_operations WHERE kind = ? AND state = 'PENDING' AND next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?) ORDER BY next_retry_at ASC, created_at ASC, id ASC LIMIT ?",
          options.kind, options.now, options.now, limit,
        );
        const claimed: WorkflowOperation[] = [];
        for (const candidate of candidates) {
          const result = db.runSync(
            "UPDATE workflow_operations SET state = 'CLAIMED', lease_owner = ?, lease_expires_at = ?, attempt = attempt + 1, updated_at = ? WHERE id = ? AND state = 'PENDING' AND next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)",
            options.owner, options.now + Math.max(1, options.leaseMs), options.now,
            candidate.id, options.now, options.now,
          );
          if (changes(result) !== 1) continue;
          const operation = get(candidate.id);
          if (operation) claimed.push(operation);
        }
        return claimed;
      });
    },
    renew(id: string, owner: string, now: number, leaseMs: number): boolean {
      assertAppDatabaseWritable(db);
      return changes(db.runSync(
        "UPDATE workflow_operations SET lease_expires_at = ?, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_owner = ?",
        now + Math.max(1, leaseMs), now, id, owner,
      )) === 1;
    },
    release(id: string, owner: string, now: number): boolean {
      assertAppDatabaseWritable(db);
      return changes(db.runSync(
        "UPDATE workflow_operations SET state = 'PENDING', lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_owner = ?",
        now, id, owner,
      )) === 1;
    },
    retry(id: string, owner: string, input: { now: number; nextRetryAt: number; error?: NormalizedError }): boolean {
      assertAppDatabaseWritable(db);
      return changes(db.runSync(
        "UPDATE workflow_operations SET state = 'PENDING', next_retry_at = ?, lease_owner = NULL, lease_expires_at = NULL, last_error_json = ?, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_owner = ?",
        input.nextRetryAt, input.error ? JSON.stringify(input.error) : null, input.now, id, owner,
      )) === 1;
    },
    finish(id: string, owner: string, state: Extract<OperationState, 'SUCCEEDED' | 'FAILED' | 'BLOCKED'>, now: number, error?: NormalizedError): boolean {
      assertAppDatabaseWritable(db);
      return changes(db.runSync(
        "UPDATE workflow_operations SET state = ?, lease_owner = NULL, lease_expires_at = NULL, last_error_json = ?, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_owner = ?",
        state, error ? JSON.stringify(error) : null, now, id, owner,
      )) === 1;
    },
    recoverExpired(now: number): WorkflowOperation[] {
      assertAppDatabaseWritable(db);
      return transaction(db, () => {
        const expired = db.getAllSync<OperationRow>(
          "SELECT * FROM workflow_operations WHERE state = 'CLAIMED' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ? ORDER BY created_at ASC, id ASC",
          now,
        );
        for (const row of expired) {
          if (row.kind === 'SUBMIT') continue;
          db.runSync(
            "UPDATE workflow_operations SET state = 'PENDING', lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_expires_at <= ?",
            now, row.id, now,
          );
        }
        return expired.filter((row) => row.kind === 'SUBMIT').map(mapRow);
      });
    },
  };
}

export type OperationRepository = ReturnType<typeof createOperationRepository>;
