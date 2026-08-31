import type { TaskRecord, TaskStatus } from './types';

const STATUS_LABELS: Record<TaskStatus, string> = {
  QUEUED: '排队中',
  RUNNING: '执行中',
  SUCCESS: '成功',
  PARTIAL_SUCCESS: '部分成功',
  FAILED: '失败',
  CANCELLED: '已取消',
  UNKNOWN: '待确认',
};

export function formatTaskStatus(status: TaskStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatTaskCreatedAt(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '—';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatSeconds(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (part: number) => String(part).padStart(2, '0');
  if (hours > 0) return `${hours}小时${pad(minutes)}分${pad(seconds)}秒`;
  return `${minutes}分${pad(seconds)}秒`;
}

export function getTaskTiming(task: TaskRecord, now: number): { queued: string; running: string } {
  const createdAt = Number.isFinite(task.createdAt) ? task.createdAt : now;
  const startedAt = task.startedAt != null && Number.isFinite(task.startedAt) ? task.startedAt : undefined;
  const queuedSeconds = startedAt != null
    ? (startedAt - createdAt) / 1000
    : task.status === 'QUEUED' || task.status === 'RUNNING'
      ? (now - createdAt) / 1000
      : undefined;
  const runningSeconds = startedAt == null || task.status === 'QUEUED'
    ? undefined
    : task.status === 'RUNNING'
      ? (now - startedAt) / 1000
      : task.executionDuration != null && Number.isFinite(task.executionDuration)
        ? task.executionDuration
        : (task.updatedAt - startedAt) / 1000;
  return {
    queued: queuedSeconds == null ? '—' : formatSeconds(queuedSeconds),
    running: runningSeconds == null ? '—' : formatSeconds(runningSeconds),
  };
}
