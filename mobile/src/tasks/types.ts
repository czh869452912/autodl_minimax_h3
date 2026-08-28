export type TaskStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
export interface TaskRecord {
  id: string; prompt: string; status: TaskStatus; resolution: string; duration: number;
  videoUrl?: string; localUri?: string; thumbnailUrl?: string; createdAt: number; updatedAt: number;
}
