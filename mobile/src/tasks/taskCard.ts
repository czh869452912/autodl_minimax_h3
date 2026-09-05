import type { DownloadState, ExportState, TaskStatus } from './types';

export type TaskCursor = Readonly<{
  createdAt: number;
  id: string;
}>;

export type TaskCard = Readonly<{
  id: string;
  prompt: string;
  status: TaskStatus;
  resolution: string;
  duration: number;
  videoUrl?: string;
  localUri?: string;
  thumbnailUrl?: string;
  downloadState: DownloadState;
  downloadError?: string;
  downloadProgress?: number;
  galleryUri?: string;
  exportState: ExportState;
  exportError?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  executionDuration?: number;
  syncError?: string;
  lastSyncAt?: number;
}>;
