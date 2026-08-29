import { NativeModules, Platform } from 'react-native';

type AutoDLMediaModule = {
  openVideo?(source: string): void;
  extractPoster?(source: string, key: string): Promise<string>;
  exportVideo?(source: string, mediaId: string, displayName: string): Promise<ExportVideoResult>;
};

export type ExportVideoResult = {
  uri: string;
  displayName: string;
  relativePath: 'Movies/AutoDL-H3/';
  alreadyExisted: boolean;
};

type ExportVideoOptions = { mediaId: string; displayName?: string };

export function openNativeVideo(source: string): boolean {
  const module = NativeModules.AutoDLMedia as AutoDLMediaModule | undefined;
  if (Platform.OS !== 'android' || !module?.openVideo || !source.trim()) return false;
  try { module.openVideo(source); return true; } catch { return false; }
}

export async function extractPoster(source: string, key: string): Promise<string | undefined> {
  const module = NativeModules.AutoDLMedia as AutoDLMediaModule | undefined;
  if (Platform.OS !== 'android' || !module?.extractPoster || !source.trim()) return undefined;
  return module.extractPoster(source, key);
}

export async function exportVideo(
  source: string,
  options: ExportVideoOptions,
  module: AutoDLMediaModule | undefined = NativeModules.AutoDLMedia,
): Promise<ExportVideoResult> {
  if (!source.trim()) throw new Error('视频源为空');
  if (!options.mediaId.trim()) throw new Error('媒体 ID 为空');
  if (!module?.exportVideo || (module === NativeModules.AutoDLMedia && Platform.OS !== 'android')) throw new Error('当前设备不支持保存到系统相册');
  return module.exportVideo(source, options.mediaId, options.displayName?.trim() || `${options.mediaId}.mp4`);
}
