export type MediaStatus = 'queued' | 'downloading' | 'downloaded' | 'failed';
export type MediaKind = 'image' | 'video' | 'audio' | 'text' | 'file' | 'json';

export type MediaDelivery = { id: string; assetId: string; target: 'system-gallery' | 'share' | 'cloud'; uri?: string; status: 'QUEUED' | 'EXPORTING' | 'EXPORTED' | 'FAILED'; error?: string; createdAt: number; updatedAt: number };

export interface MediaAsset {
  id: string;
  taskId: string;
  title: string;
  prompt: string;
  sourceUrl: string;
  artifactId?: string;
  jobId?: string;
  workflowId?: string;
  kind?: MediaKind;
  localPath?: string;
  posterPath?: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  status: MediaStatus;
  /** Human-readable publication state for the system gallery. */
  exportStatus?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MediaStore {
  upsert(asset: MediaAsset): Promise<void>;
  upsertArtifactProjection?(asset: MediaAsset): Promise<void>;
  list(options?: { query?: string; status?: MediaStatus; kind?: MediaKind }): Promise<MediaAsset[]>;
  listPage?(options?: { query?: string; status?: MediaStatus; kind?: MediaKind; limit?: number; cursor?: { createdAt: number; id: string } }): Promise<{ items: MediaAsset[]; nextCursor?: { createdAt: number; id: string } }>;
  get(id: string): Promise<MediaAsset | null>;
  getPrimaryVideoByTaskId?(taskId: string): Promise<MediaAsset | null>;
  remove(id: string): Promise<void>;
  upsertDelivery?(delivery: MediaDelivery): Promise<void>;
  listDeliveries?(assetId: string): Promise<MediaDelivery[]>;
}
