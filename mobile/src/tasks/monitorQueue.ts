import type { AppDatabase } from '../storage/appDatabase';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { createOperationRepository } from '../workflows/executor/operationRepository';
import { createExecutorWakeRepository } from './executorWakeRepository';
import { projectTerminalNotifications, type TerminalTaskEvent, type TerminalTaskStatus } from './terminalEvents';

export function createMonitorQueue(db: AppDatabase) {
  return {
    async cursor(): Promise<number> {
      // sqlite_sequence survives deletion of the last event; rowid/MAX does not.
      return (await db.getFirstAsync<{ seq: number }>("SELECT seq FROM sqlite_sequence WHERE name='task_monitor_events'"))?.seq ?? 0;
    },
    async read(cursor: number) {
      const rows = await db.getAllAsync<{ sequence: number; event_id: string; job_id: string; event_type: string; payload_json: string; created_at: number }>(
        `SELECT m.sequence,m.event_id,e.job_id,e.event_type,e.payload_json,e.created_at
         FROM task_monitor_events m JOIN workflow_job_events e ON e.id=m.event_id
         WHERE m.sequence>? ORDER BY m.sequence LIMIT 64`, cursor);
      const statuses: Record<string, TerminalTaskStatus> = { SUCCEEDED: 'SUCCESS', PARTIAL_SUCCEEDED: 'PARTIAL_SUCCESS', FAILED: 'FAILED', CANCELLED: 'CANCELLED' };
      const events: TerminalTaskEvent[] = rows.flatMap(row => {
        let status: TerminalTaskStatus | undefined;
        try {
          status = row.event_type === 'cancelled' ? 'CANCELLED'
            : row.event_type === 'SUBMIT_FAILED' || row.event_type === 'STATUS_SYNC_FAILED' ? 'FAILED'
              : statuses[JSON.parse(row.payload_json).status];
        } catch { /* malformed events are consumed without exposing their contents */ }
        return status ? [{ eventId: row.event_id, taskId: row.job_id, status, createdAt: row.created_at }] : [];
      });
      return { events: projectTerminalNotifications(events), cursor: rows.at(-1)?.sequence ?? cursor, hasMore: rows.length === 64 };
    },
    async stopIfIdle(cursor: number, stop: () => Promise<boolean>): Promise<boolean> {
      // Serialize the final decision with submissions/media commands, not just other workers.
      return withWriteTransaction(db, async tx => {
        // Installed Expo SQLite uses BEGIN on an isolated connection. Acquire the
        // writer lock explicitly before reading, including under WAL/test adapters.
        await tx.runAsync('UPDATE executor_wake_state SET requested_at=requested_at WHERE singleton=1');
        const pending = await createOperationRepository(tx).pendingSummary({ now: Date.now() });
        const wake = await createExecutorWakeRepository(tx).read();
        const claimed = await tx.getFirstAsync("SELECT 1 FROM workflow_operations WHERE state='CLAIMED' LIMIT 1");
        const worker = await tx.getFirstAsync("SELECT 1 FROM app_scheduler_leases WHERE lease_key='task-executor' AND expires_at>? LIMIT 1", Date.now());
        const unread = await tx.getFirstAsync('SELECT 1 FROM task_monitor_events WHERE sequence>? LIMIT 1', cursor);
        if (pending.remainingDue + pending.remainingScheduled > 0 || pending.nextWakeAt != null || wake.generation > wake.handledGeneration || unread || claimed || worker) return false;
        // Deliberate exception to DB-only transaction callbacks: this is a local,
        // session-fenced, idempotent stop acknowledgement, never notification/network
        // I/O. Hold the lock through acknowledgement to linearize against submissions.
        // A stalled native main thread can delay other writers past their busy budget;
        // do not add slow work here or release the lock on a JS timeout (the queued
        // native stop could otherwise execute later against newly submitted work).
        return stop();
      });
    },
  };
}
