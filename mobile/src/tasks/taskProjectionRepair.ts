import type { SQLiteDatabase } from 'expo-sqlite';
import type { ArtifactRecord } from '../jobs/types';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { createJobStateRepository } from '../workflows/executor/jobStateRepository';
import { createTaskRepository } from './repository';
import { jobToTaskProjection } from './projection';

// Recover projections left stale by older builds, including jobs outside the
// recent-history window. This bounded correctness repair has no media I/O and
// must not be gated by the five-minute maintenance cooldown.
export async function repairStaleTaskStatuses(db: SQLiteDatabase, limit = 32): Promise<{ repaired: number; hasMore: boolean }> {
  const bounded = Math.max(1, Math.min(32, Math.floor(limit)));
  const candidates = await db.getAllAsync<{ id: string }>(`SELECT j.id FROM workflow_jobs j LEFT JOIN tasks t ON t.id=j.id
    WHERE t.id IS NULL OR t.status <> CASE j.status
      WHEN 'SUCCEEDED' THEN 'SUCCESS' WHEN 'PARTIAL_SUCCEEDED' THEN 'PARTIAL_SUCCESS'
      WHEN 'RUNNING' THEN 'RUNNING' WHEN 'FAILED' THEN 'FAILED' WHEN 'CANCELLED' THEN 'CANCELLED'
      WHEN 'UNKNOWN' THEN 'UNKNOWN' ELSE 'QUEUED' END
    ORDER BY j.updated_at ASC,j.id ASC LIMIT ?`, bounded + 1);
  let repaired = 0;
  for (const candidate of candidates.slice(0, bounded)) {
    const changed = await withWriteTransaction(db, async txn => {
      const job = await createJobStateRepository(txn).get(candidate.id);
      if (!job) return false; // Removal may have won after candidate selection.
      const tasks = createTaskRepository(txn);
      const previous = await tasks.get(candidate.id);
      const artifacts = await txn.getAllAsync<{ id: string; kind: ArtifactRecord['kind']; uri: string | null }>(
        'SELECT id,kind,uri FROM workflow_artifacts WHERE job_id=? ORDER BY id', candidate.id,
      );
      const projection = jobToTaskProjection(job, artifacts.map(row => ({ ...row, jobId: job.id, uri: row.uri ?? undefined })), previous);
      if (previous?.status === projection.status) return false;
      await tasks.upsertWorkflowProjection(projection);
      return true;
    });
    if (changed) repaired++;
  }
  return { repaired, hasMore: candidates.length > bounded };
}
