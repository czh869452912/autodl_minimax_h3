export type ScreenType = 'create' | 'agent' | 'tasks' | 'gallery' | 'settings';

export interface MediaItem {
  id: string;
  kind: 'image' | 'audio';
  name: string;
  mime: string;
  size: number;
  dataUri: string;
}

export interface VideoTask {
  id: string;
  prompt: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  resolution: string;
  duration: number;
  seed?: string;
  images?: MediaItem[];
  audios?: MediaItem[];
  videoUrl?: string;
  localUri?: string;
  title?: string;
  thumbnailUrl?: string;
  downloadState?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface GalleryItem {
  id: string;
  title: string;
  prompt: string;
  duration: string;
  thumbnailUrl: string;
  videoUrl: string;
  localUri?: string;
  resolution: string;
  timestamp: string;
  status?: string;
}

export interface AppSettings {
  token: string;
  llmApiKey: string;
  llmEndpoint: string;
  llmModel?: string;
  theme: 'dark' | 'light';
}

export interface AgentMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  images?: string[];
  timestamp: number;
}
