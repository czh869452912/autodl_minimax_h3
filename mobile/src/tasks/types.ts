export type TaskStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
export type DownloadState = 'IDLE' | 'ENQUEUED' | 'DOWNLOADING' | 'DOWNLOADED' | 'DOWNLOAD_FAILED';
export type ExportState = 'NOT_REQUESTED' | 'QUEUED' | 'EXPORTING' | 'EXPORTED' | 'EXPORT_FAILED';
export interface TaskMediaInput { dataUri: string; name?: string; mime?: string; }
export interface TaskRecord {
  id: string; prompt: string; status: TaskStatus; resolution: string; duration: number;
  seed?: string; images?: TaskMediaInput[]; audios?: TaskMediaInput[];
  videoUrl?: string; localUri?: string; thumbnailUrl?: string; downloadState?: DownloadState; downloadError?: string; downloadProgress?: number;
  galleryUri?: string; exportState?: ExportState; exportError?: string; exportedAt?: number; createdAt: number; updatedAt: number;
  startedAt?: number; executionDuration?: number;
}
