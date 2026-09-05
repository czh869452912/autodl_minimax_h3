import type { SQLiteDatabase } from 'expo-sqlite';
import type { DownloadState, ExportState, TaskStatus } from './types';
import type { TaskCard, TaskCursor } from './taskCard';

type TaskCardRow = {
  id: string;
  prompt: string;
  status: TaskStatus;
  resolution: string;
  duration: number;
  video_url?: string | null;
  local_uri?: string | null;
  thumbnail_url?: string | null;
  download_state?: DownloadState | null;
  download_error?: string | null;
  download_progress?: number | null;
  gallery_uri?: string | null;
  export_state?: ExportState | null;
  export_error?: string | null;
  created_at: number;
  updated_at: number;
  started_at?: number | null;
  execution_duration?: number | null;
  sync_error?: string | null;
  last_sync_at?: number | null;
};

type RevisionRow = { revision: number };
type ActivityRow = {
  active_task_count: number | null;
  pending_operation_count: number | null;
  claimed_operation_count: number | null;
  remaining_due: number | null;
  remaining_scheduled: number | null;
  next_wake_at: number | null;
};

export type TaskProjectionActivity = Readonly<{
  activeTaskCount: number;
  pendingOperationCount: number;
  claimedOperationCount: number;
  remainingDue: number;
  remainingScheduled: number;
  nextWakeAt?: number;
}>;

export type TaskProjectionWindow = Readonly<{
  items: readonly TaskCard[];
  nextCursor?: TaskCursor;
}>;

export type ConsistentTaskProjectionWindow = TaskProjectionWindow & Readonly<{
  revision: number;
  activity: TaskProjectionActivity;
}>;

export class ProjectionChangedDuringRead extends Error {
  readonly attempts: number;

  constructor(attempts: number) {
    super(`Task projection changed during ${attempts} read attempt${attempts === 1 ? '' : 's'}`);
    this.name = 'ProjectionChangedDuringRead';
    this.attempts = attempts;
  }
}

const taskCardColumns = [
  'id', 'prompt', 'status', 'resolution', 'duration',
  'video_url', 'local_uri', 'thumbnail_url',
  'download_state', 'download_error', 'download_progress',
  'gallery_uri', 'export_state', 'export_error',
  'created_at', 'updated_at', 'started_at', 'execution_duration',
  'sync_error', 'last_sync_at',
].join(', ');

function optionalString(value: string | null | undefined): string | undefined {
  return value || undefined;
}

function optionalNumber(value: number | null | undefined): number | undefined {
  return value == null ? undefined : Number(value);
}

function toTaskCard(row: TaskCardRow): TaskCard {
  return {
    id: row.id,
    prompt: row.prompt,
    status: row.status,
    resolution: row.resolution,
    duration: Number(row.duration),
    ...(optionalString(row.video_url) ? { videoUrl: optionalString(row.video_url) } : {}),
    ...(optionalString(row.local_uri) ? { localUri: optionalString(row.local_uri) } : {}),
    ...(optionalString(row.thumbnail_url) ? { thumbnailUrl: optionalString(row.thumbnail_url) } : {}),
    downloadState: row.download_state ?? (row.local_uri ? 'DOWNLOADED' : 'IDLE'),
    ...(optionalString(row.download_error) ? { downloadError: optionalString(row.download_error) } : {}),
    ...(optionalNumber(row.download_progress) == null ? {} : { downloadProgress: optionalNumber(row.download_progress) }),
    ...(optionalString(row.gallery_uri) ? { galleryUri: optionalString(row.gallery_uri) } : {}),
    exportState: row.export_state ?? 'NOT_REQUESTED',
    ...(optionalString(row.export_error) ? { exportError: optionalString(row.export_error) } : {}),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    ...(optionalNumber(row.started_at) == null ? {} : { startedAt: optionalNumber(row.started_at) }),
    ...(optionalNumber(row.execution_duration) == null ? {} : { executionDuration: optionalNumber(row.execution_duration) }),
    ...(optionalString(row.sync_error) ? { syncError: optionalString(row.sync_error) } : {}),
    ...(optionalNumber(row.last_sync_at) == null ? {} : { lastSyncAt: optionalNumber(row.last_sync_at) }),
  };
}

function boundedLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 40;
  return Math.max(1, Math.min(120, Math.floor(limit)));
}

function boundedAttempts(maxAttempts: number): number {
  if (!Number.isFinite(maxAttempts)) return 2;
  return Math.max(1, Math.floor(maxAttempts));
}

export function createTaskProjectionRepository(db: SQLiteDatabase) {
  const readRevision = async (): Promise<number> => {
    const row = await db.getFirstAsync<RevisionRow>(
      'SELECT revision FROM task_projection_state WHERE singleton = 1 LIMIT 1',
    );
    return Number(row?.revision ?? 0);
  };

  const readWindow = async (limit = 40, cursor?: TaskCursor): Promise<TaskProjectionWindow> => {
    const bounded = boundedLimit(limit);
    const rows = await db.getAllAsync<TaskCardRow>(
      `SELECT ${taskCardColumns}
       FROM tasks
       WHERE (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, bounded + 1,
    );
    const hasMore = rows.length > bounded;
    const items = rows.slice(0, bounded).map(toTaskCard);
    const last = items.at(-1);
    return {
      items,
      ...(hasMore && last ? { nextCursor: { createdAt: last.createdAt, id: last.id } } : {}),
    };
  };

  const readActivity = async (now: number): Promise<TaskProjectionActivity> => {
    const row = await db.getFirstAsync<ActivityRow>(
      `SELECT
        (SELECT COUNT(*) FROM tasks WHERE
          status IN ('QUEUED', 'RUNNING', 'UNKNOWN') OR
          download_state IN ('ENQUEUED', 'DOWNLOADING') OR
          export_state IN ('QUEUED', 'EXPORTING')
        ) AS active_task_count,
        (SELECT COUNT(*) FROM workflow_operations WHERE state = 'PENDING') AS pending_operation_count,
        (SELECT COUNT(*) FROM workflow_operations WHERE state = 'CLAIMED') AS claimed_operation_count,
        (SELECT COUNT(*) FROM workflow_operations WHERE
          (state = 'PENDING' AND next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)) OR
          (state = 'CLAIMED' AND (lease_expires_at IS NULL OR lease_expires_at <= ?))
        ) AS remaining_due,
        (SELECT COUNT(*) FROM workflow_operations WHERE
          (state = 'PENDING' AND NOT (next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?))) OR
          (state = 'CLAIMED' AND lease_expires_at > ?)
        ) AS remaining_scheduled,
        (SELECT MIN(CASE
          WHEN state = 'PENDING' AND NOT (next_retry_at <= ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?))
            THEN CASE WHEN lease_expires_at IS NOT NULL AND lease_expires_at > next_retry_at THEN lease_expires_at ELSE next_retry_at END
          WHEN state = 'CLAIMED' AND lease_expires_at > ? THEN lease_expires_at
        END) FROM workflow_operations WHERE state IN ('PENDING', 'CLAIMED')) AS next_wake_at`,
      now, now, now, now, now, now, now, now, now,
    );
    return {
      activeTaskCount: Number(row?.active_task_count ?? 0),
      pendingOperationCount: Number(row?.pending_operation_count ?? 0),
      claimedOperationCount: Number(row?.claimed_operation_count ?? 0),
      remainingDue: Number(row?.remaining_due ?? 0),
      remainingScheduled: Number(row?.remaining_scheduled ?? 0),
      ...(row?.next_wake_at == null ? {} : { nextWakeAt: Number(row.next_wake_at) }),
    };
  };

  const readConsistentWindow = async (
    limit = 40,
    maxAttempts = 2,
  ): Promise<ConsistentTaskProjectionWindow | ProjectionChangedDuringRead> => {
    const attempts = boundedAttempts(maxAttempts);
    const now = Date.now();
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const revision = await readRevision();
      const [window, activity] = await Promise.all([readWindow(limit), readActivity(now)]);
      if (revision === await readRevision()) return { revision, ...window, activity };
    }
    return new ProjectionChangedDuringRead(attempts);
  };

  return { readRevision, readWindow, readActivity, readConsistentWindow };
}

export type TaskProjectionRepository = ReturnType<typeof createTaskProjectionRepository>;
