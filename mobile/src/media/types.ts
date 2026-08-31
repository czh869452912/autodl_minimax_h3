export type MediaStatus = 'queued' | 'downloading' | 'downloaded' | 'failed';

export interface MediaAsset {
  id: string;
  taskId: string;
  title: string;
  prompt: string;
  sourceUrl: string;
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
  list(options?: { query?: string; status?: MediaStatus }): Promise<MediaAsset[]>;
  listPage?(options?: { query?: string; status?: MediaStatus; limit?: number; cursor?: { createdAt: number; id: string } }): Promise<{ items: MediaAsset[]; nextCursor?: { createdAt: number; id: string } }>;
  get(id: string): Promise<MediaAsset | null>;
  remove(id: string): Promise<void>;
}
