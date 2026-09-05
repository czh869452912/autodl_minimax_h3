import { withWriteTransaction } from '../../storage/sqliteBusy';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { NormalizedError } from '../../jobs/types';
import { assertAppDatabaseWritable, assertAppDatabaseWritableAsync } from '../../storage/database';
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

async function exclusiveTransaction<T>(db: SQLiteDatabase, work: (transaction: SQLiteDatabase) => Promise<T>): Promise<T> {
  let result!: T;
  await withWriteTransaction(db, async (transaction) => {
    result = await work(transaction);
  });
  return result;
}

export type ExpiredRecovery = Readonly<{
  uncertainSubmits: readonly WorkflowOperation[];
  reopened: number;
  hasMore: boolean;
}>;

export function createOperationRepository(db: SQLiteDatabase) {
  const get = async (id: string): Promise<WorkflowOperation | undefined> => {
    const row = await db.getFirstAsync<OperationRow>('SELECT * FROM workflow_operations WHERE id = ? LIMIT 1', id);
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
    async listDue(options: { kind: OperationKind; now: number; limit: number }): Promise<WorkflowOperation[]> {
      const limit = Math.max(0, Math.floor(options.limit));
      if (limit === 0) return [];
      return (await db.getAllAsync<OperationRow>(
        "SELECT * FROM workflow_operations WHERE kind = ? AND state = 'PENDING' AND next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?) ORDER BY next_retry_at ASC, created_at ASC, id ASC LIMIT ?",
        options.kind, options.now, options.now, limit,
      )).map(mapRow);
    },
    async listDueSnapshot(options: { now: number; perLaneLimit: number }): Promise<WorkflowOperation[]> {
      const perLaneLimit = Math.max(0, Math.floor(options.perLaneLimit));
      if (perLaneLimit === 0) return [];
      const rows = await db.getAllAsync<OperationRow>(
        `WITH ranked_due_operations AS (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY kind
            ORDER BY next_retry_at ASC, created_at ASC, id ASC
          ) AS lane_rank
          FROM workflow_operations
          WHERE kind IN ('SUBMIT','STATUS_SYNC','ARTIFACT_DOWNLOAD','EXPORT')
            AND state = 'PENDING'
            AND next_retry_at <= ?
            AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        )
        SELECT * FROM ranked_due_operations
        WHERE lane_rank <= ?
        ORDER BY CASE kind
          WHEN 'SUBMIT' THEN 0
          WHEN 'STATUS_SYNC' THEN 1
          WHEN 'ARTIFACT_DOWNLOAD' THEN 2
          WHEN 'EXPORT' THEN 3
        END, next_retry_at ASC, created_at ASC, id ASC`,
        options.now, options.now, perLaneLimit,
      );
      return rows.map(mapRow);
    },
    async pendingSummary(options: { now: number; jobIds?: string[] }): Promise<PendingSummary> {
      if (options.jobIds && options.jobIds.length === 0) return { remainingDue: 0, remainingScheduled: 0 };
      const scope = options.jobIds ? ` AND job_id IN (${options.jobIds.map(() => '?').join(',')})` : '';
      const row = await db.getFirstAsync<{
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
    async countOutstanding(jobIds: string[]): Promise<number> {
      if (jobIds.length === 0) return 0;
      const placeholders = jobIds.map(() => '?').join(',');
      const row = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM workflow_operations WHERE state IN ('PENDING','CLAIMED') AND job_id IN (${placeholders})`,
        ...jobIds,
      );
      return Number(row?.count ?? 0);
    },
    async expediteRetryableNetwork(jobIds: string[], now: number): Promise<number> {
      if (jobIds.length === 0) return 0;
      await assertAppDatabaseWritableAsync(db);
      const placeholders = jobIds.map(() => '?').join(',');
      const result = await db.runAsync(
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
    async claimById(id: string, owner: string, now: number, leaseMs: number): Promise<WorkflowOperation | undefined> {
      await assertAppDatabaseWritableAsync(db);
      const leaseExpiresAt = now + Math.max(1, leaseMs);
      const claimed = await exclusiveTransaction(db, async (transaction) => {
        const row = await transaction.getFirstAsync<OperationRow & { claimed_from_attempt: number }>(
          `UPDATE workflow_operations
          SET state = 'CLAIMED', lease_owner = ?, lease_expires_at = ?, attempt = attempt + 1, updated_at = ?
          WHERE id = ? AND state = 'PENDING' AND next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
          RETURNING *, attempt - 1 AS claimed_from_attempt`,
          owner, leaseExpiresAt, now, id, now, now,
        );
        if (!row) return undefined;
        const expectedAttempt = Number(row.claimed_from_attempt) + 1;
        if (row.state !== 'CLAIMED'
          || row.lease_owner !== owner
          || Number(row.lease_expires_at) !== leaseExpiresAt
          || Number(row.attempt) !== expectedAttempt) {
          throw new Error('OPERATION_CLAIM_FENCE_MISMATCH');
        }
        return mapRow(row);
      });
      if (!claimed) return undefined;
      const current = await get(id);
      if (!current
        || current.state !== 'CLAIMED'
        || current.leaseOwner !== owner
        || current.leaseExpiresAt !== leaseExpiresAt
        || current.attempt !== claimed.attempt) {
        throw new Error('OPERATION_CLAIM_FENCE_MISMATCH');
      }
      return claimed;
    },
    async claimDue(options: { kind: OperationKind; owner: string; now: number; leaseMs: number; limit: number }): Promise<WorkflowOperation[]> {
      await assertAppDatabaseWritableAsync(db);
      return exclusiveTransaction(db, async (transaction) => {
        const limit = Math.max(0, Math.floor(options.limit));
        if (limit === 0) return [];
        const candidates = await transaction.getAllAsync<{ id: string }>(
          "SELECT id FROM workflow_operations WHERE kind = ? AND state = 'PENDING' AND next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?) ORDER BY next_retry_at ASC, created_at ASC, id ASC LIMIT ?",
          options.kind, options.now, options.now, limit,
        );
        const claimed: WorkflowOperation[] = [];
        for (const candidate of candidates) {
          const result = await transaction.runAsync(
            "UPDATE workflow_operations SET state = 'CLAIMED', lease_owner = ?, lease_expires_at = ?, attempt = attempt + 1, updated_at = ? WHERE id = ? AND state = 'PENDING' AND next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)",
            options.owner, options.now + Math.max(1, options.leaseMs), options.now,
            candidate.id, options.now, options.now,
          );
          if (changes(result) !== 1) continue;
          const row = await transaction.getFirstAsync<OperationRow>('SELECT * FROM workflow_operations WHERE id = ? LIMIT 1', candidate.id);
          if (row) claimed.push(mapRow(row));
        }
        return claimed;
      });
    },
    async renew(id: string, owner: string, now: number, leaseMs: number): Promise<boolean> {
      await assertAppDatabaseWritableAsync(db);
      return changes(await db.runAsync(
        "UPDATE workflow_operations SET lease_expires_at = ?, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_owner = ?",
        now + Math.max(1, leaseMs), now, id, owner,
      )) === 1;
    },
    async release(id: string, owner: string, now: number): Promise<boolean> {
      await assertAppDatabaseWritableAsync(db);
      return changes(await db.runAsync(
        "UPDATE workflow_operations SET state = 'PENDING', lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_owner = ?",
        now, id, owner,
      )) === 1;
    },
    async retry(id: string, owner: string, input: { now: number; nextRetryAt: number; error?: NormalizedError }): Promise<boolean> {
      await assertAppDatabaseWritableAsync(db);
      return changes(await db.runAsync(
        "UPDATE workflow_operations SET state = 'PENDING', next_retry_at = ?, lease_owner = NULL, lease_expires_at = NULL, last_error_json = ?, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_owner = ?",
        input.nextRetryAt, input.error ? JSON.stringify(input.error) : null, input.now, id, owner,
      )) === 1;
    },
    async finish(id: string, owner: string, state: Extract<OperationState, 'SUCCEEDED' | 'FAILED' | 'BLOCKED'>, now: number, error?: NormalizedError): Promise<boolean> {
      await assertAppDatabaseWritableAsync(db);
      return changes(await db.runAsync(
        "UPDATE workflow_operations SET state = ?, lease_owner = NULL, lease_expires_at = NULL, last_error_json = ?, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_owner = ?",
        state, error ? JSON.stringify(error) : null, now, id, owner,
      )) === 1;
    },
    async recoverExpired(now: number, requestedLimit: number): Promise<ExpiredRecovery> {
      await assertAppDatabaseWritableAsync(db);
      const limit = Math.max(0, Math.floor(requestedLimit));
      if (limit === 0) return { uncertainSubmits: [], reopened: 0, hasMore: false };
      const candidate = await db.getFirstAsync<{ present: number }>(
        "SELECT 1 AS present FROM workflow_operations WHERE state = 'CLAIMED' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ? LIMIT 1",
        now,
      );
      if (!candidate) return { uncertainSubmits: [], reopened: 0, hasMore: false };
      return exclusiveTransaction(db, async (transaction) => {
        const expired = await transaction.getAllAsync<OperationRow>(
          "SELECT * FROM workflow_operations WHERE state = 'CLAIMED' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ? ORDER BY created_at ASC, id ASC LIMIT ?",
          now, limit + 1,
        );
        const batch = expired.slice(0, limit);
        let reopened = 0;
        for (const row of batch) {
          if (row.kind === 'SUBMIT') continue;
          const result = await transaction.runAsync(
            "UPDATE workflow_operations SET state = 'PENDING', lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND state = 'CLAIMED' AND lease_expires_at <= ?",
            now, row.id, now,
          );
          reopened += changes(result);
        }
        return {
          uncertainSubmits: batch.filter((row) => row.kind === 'SUBMIT').map(mapRow),
          reopened,
          hasMore: expired.length > limit,
        };
      });
    },
  };
}

export type OperationRepository = ReturnType<typeof createOperationRepository>;
