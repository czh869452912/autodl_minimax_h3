export type ScreenType = 'create' | 'settings' | 'tasks' | 'gallery';

export interface VideoTask {
  id: string;
  title: string;
  prompt: string;
  status: 'rendering' | 'queuing' | 'done' | 'failed';
  progress?: number;
  step?: string;
  eta?: string;
  queuePosition?: number;
  timeAgo: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  aspectRatio: string;
  duration: number;
  model: string;
  createdAt: number;
  errorReason?: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  prompt: string;
  status: 'done' | 'generating' | 'failed';
  progress?: number;
  duration: string;
  thumbnailUrl: string;
  aspectRatio: string;
  timestamp: string;
}

export interface AppSettings {
  apiKey: string;
  apiSecret: string;
  theme: 'dark' | 'light';
  outputQuality: string;
  notifications: boolean;
  cacheSizeMB: number;
  computeCredits: number;
}
