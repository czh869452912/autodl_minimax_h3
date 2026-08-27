import { VideoTask } from '../types';

export interface AndroidBridgeInterface {
  isNativeAvailable?(): boolean;
  saveToken?(token: string): boolean;
  readToken?(): string;
  saveLlmConfig?(apiKey: string, endpoint: string, model?: string): boolean;
  readLlmApiKey?(): string;
  readLlmEndpoint?(): string;
  readLlmModel?(): string;
  submitTask?(taskJson: string): boolean;
  loadTasks?(): string;
  saveTasks?(tasksJson: string): void;
  pickMedia?(kind: number): void;
}

declare global {
  interface Window {
    AndroidBridge?: AndroidBridgeInterface;
    onMediaPicked?: (mediaJson: string) => void;
    onTaskStatusUpdated?: (taskJson: string) => void;
  }
}

export const isNativeApp = (): boolean => {
  return typeof window !== 'undefined' && !!window.AndroidBridge;
};

export const nativeSaveToken = (token: string): boolean => {
  if (window.AndroidBridge?.saveToken) {
    return window.AndroidBridge.saveToken(token);
  }
  localStorage.setItem('autodl_token', token);
  return true;
};

export const nativeReadToken = (): string => {
  if (window.AndroidBridge?.readToken) {
    return window.AndroidBridge.readToken();
  }
  return localStorage.getItem('autodl_token') || '';
};

export const nativeSaveLlmConfig = (apiKey: string, endpoint: string, model: string): boolean => {
  if (window.AndroidBridge?.saveLlmConfig) {
    return window.AndroidBridge.saveLlmConfig(apiKey, endpoint, model);
  }
  localStorage.setItem('llm_api_key', apiKey);
  localStorage.setItem('llm_endpoint', endpoint);
  localStorage.setItem('llm_model', model);
  return true;
};

export const nativeReadLlmConfig = (): { apiKey: string; endpoint: string; model: string } => {
  if (window.AndroidBridge) {
    const key = window.AndroidBridge.readLlmApiKey ? window.AndroidBridge.readLlmApiKey() : '';
    const ep = window.AndroidBridge.readLlmEndpoint ? window.AndroidBridge.readLlmEndpoint() : '';
    const mod = window.AndroidBridge.readLlmModel ? window.AndroidBridge.readLlmModel() : '';
    return {
      apiKey: key,
      endpoint: ep || 'https://api.minimax.chat/v1/text/chatcompletion_v2',
      model: mod || 'abab6.5s-chat'
    };
  }
  return {
    apiKey: localStorage.getItem('llm_api_key') || '',
    endpoint: localStorage.getItem('llm_endpoint') || 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    model: localStorage.getItem('llm_model') || 'abab6.5s-chat'
  };
};

export const nativeSubmitTask = (taskData: any): boolean => {
  if (window.AndroidBridge?.submitTask) {
    return window.AndroidBridge.submitTask(JSON.stringify(taskData));
  }
  return false;
};

export const nativeLoadTasks = (): VideoTask[] => {
  if (window.AndroidBridge?.loadTasks) {
    try {
      const raw = window.AndroidBridge.loadTasks();
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  try {
    const raw = localStorage.getItem('autodl_tasks');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const nativeSaveTasks = (tasks: VideoTask[]) => {
  const jsonStr = JSON.stringify(tasks.slice(0, 30));
  if (window.AndroidBridge?.saveTasks) {
    window.AndroidBridge.saveTasks(jsonStr);
  } else {
    localStorage.setItem('autodl_tasks', jsonStr);
  }
};

export const nativePickMedia = (kind: 'image' | 'audio') => {
  if (window.AndroidBridge?.pickMedia) {
    window.AndroidBridge.pickMedia(kind === 'image' ? 0 : 1);
  }
};
