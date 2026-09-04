import { NativeModules, Platform } from 'react-native';

type AutoDLMediaModule = {
  openVideo?(source: string): void;
  extractPoster?(source: string, key: string): Promise<string>;
  exportVideo?(source: string, mediaId: string, displayName: string): Promise<ExportVideoResult>;
  sha256File?(source: string): Promise<string>;
  probeVideo?(source: string): Promise<VideoProbeResult & { hasVideoTrack?: boolean }>;
};

export type VideoProbeResult = {
  durationMs: number;
  videoTrackCount: number;
  decodedFrames: number;
  sampleCount: number;
};

export class MediaIntegrityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MediaIntegrityError';
  }
}

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

function requireIntegritySource(source: string): string {
  const value = source.trim();
  if (!value) throw new MediaIntegrityError('MEDIA_SOURCE_INVALID', '媒体 URI 为空');
  return value;
}

function requireIntegrityModule(module: AutoDLMediaModule | undefined, method: 'sha256File' | 'probeVideo'): AutoDLMediaModule {
  if (!module?.[method] || (module === NativeModules.AutoDLMedia && Platform.OS !== 'android')) {
    throw new MediaIntegrityError('MEDIA_INTEGRITY_UNAVAILABLE', '当前设备不支持媒体完整性验证');
  }
  return module;
}

export async function sha256File(
  source: string,
  module: AutoDLMediaModule | undefined = NativeModules.AutoDLMedia,
): Promise<string> {
  const value = requireIntegritySource(source);
  const native = requireIntegrityModule(module, 'sha256File');
  const hash = await native.sha256File!(value);
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new MediaIntegrityError('MEDIA_INTEGRITY_INVALID', '原生文件哈希结果不合法');
  return hash;
}

export async function probeVideo(
  source: string,
  module: AutoDLMediaModule | undefined = NativeModules.AutoDLMedia,
): Promise<VideoProbeResult> {
  const value = requireIntegritySource(source);
  const native = requireIntegrityModule(module, 'probeVideo');
  const result = await native.probeVideo!(value);
  const hasVideoTrack = result.hasVideoTrack !== false && Number.isInteger(result.videoTrackCount) && result.videoTrackCount > 0;
  if (!hasVideoTrack || !Number.isFinite(result.durationMs) || result.durationMs <= 0 || !Number.isInteger(result.decodedFrames) || result.decodedFrames < 3 || !Number.isFinite(result.sampleCount) || result.sampleCount <= 0) {
    throw new MediaIntegrityError('MEDIA_INVALID', '视频文件不可播放');
  }
  return result;
}
