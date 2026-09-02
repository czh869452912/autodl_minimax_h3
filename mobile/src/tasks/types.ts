export type TaskStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';
export type DownloadState = 'IDLE' | 'ENQUEUED' | 'DOWNLOADING' | 'DOWNLOADED' | 'DOWNLOAD_FAILED';
export type ExportState = 'NOT_REQUESTED' | 'QUEUED' | 'EXPORTING' | 'EXPORTED' | 'EXPORT_FAILED';
export interface TaskMediaInput { uri?: string; dataUri?: string; name?: string; mime?: string; size?: number; sha256?: string; }
export interface TaskRecord {
  id: string; prompt: string; status: TaskStatus; resolution: string; duration: number;
  workflowId?: string; workflowVersion?: string; workflowContentHash?: string; adapterId?: string; adapterVersion?: string;
  inputSnapshot?: Record<string, unknown>;
  seed?: string; images?: TaskMediaInput[]; audios?: TaskMediaInput[];
  videoUrl?: string; localUri?: string; thumbnailUrl?: string; downloadState?: DownloadState; downloadError?: string; downloadProgress?: number;
  galleryUri?: string; exportState?: ExportState; exportError?: string; exportedAt?: number; createdAt: number; updatedAt: number;
  startedAt?: number; executionDuration?: number; syncError?: string; lastSyncAt?: number;
}

export type TaskMediaPatch = Partial<Pick<TaskRecord,
  'localUri' | 'thumbnailUrl' | 'downloadState' | 'downloadError' | 'downloadProgress' |
  'galleryUri' | 'exportState' | 'exportError' | 'exportedAt' | 'updatedAt'
>>;
