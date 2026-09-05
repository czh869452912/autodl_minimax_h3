import { NativeModules, Platform } from 'react-native';

type AutoDLMediaModule = {
  openVideo?(source: string): void;
  extractPoster?(source: string, key: string): Promise<string>;
  exportVideo?(source: string, mediaId: string, displayName: string): Promise<ExportVideoResult>;
  sha256File?(source: string): Promise<string>;
  probeVideo?(source: string): Promise<VideoProbeResult & { hasVideoTrack?: boolean }>;
  transferArtifact?(options: NativeArtifactTransferRequest): Promise<NativeArtifactTransferResult>;
  cancelArtifactTransfer?(operationId: string): Promise<boolean>;
};

export type NativeArtifactTransferRequest = Readonly<{
  url: string;
  allowedHosts: readonly string[];
  allowProviderSuppliedPublicHosts: boolean;
  acceptedMimes: readonly string[];
  maxBytes: number;
  connectTimeoutMs: number;
  idleTimeoutMs: number;
  expectedSha256?: string;
  operationId: string;
  operationAttempt: number;
}>;

export type NativeArtifactTransferResult = Readonly<{
  partUri: string;
  finalUrl: string;
  mime: string;
  byteSize: number;
  sha256: string;
}>;

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

function artifactError(code: string, message: string): never {
  throw new MediaIntegrityError(code, message);
}

function requireArtifactModule(
  module: AutoDLMediaModule | undefined,
  method: 'transferArtifact' | 'cancelArtifactTransfer',
): AutoDLMediaModule {
  if (!module?.[method] || (module === NativeModules.AutoDLMedia && Platform.OS !== 'android')) {
    artifactError('ARTIFACT_TRANSFER_UNAVAILABLE', '当前设备不支持原生制品传输');
  }
  return module;
}

function validPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validateTransferRequest(request: NativeArtifactTransferRequest): void {
  const validHash = request.expectedSha256 == null || /^[a-f0-9]{64}$/.test(request.expectedSha256);
  const validStrings = request.url.trim() && request.operationId.trim() &&
    request.acceptedMimes.length > 0 && request.acceptedMimes.every((value) => value.trim()) &&
    request.allowedHosts.every((value) => typeof value === 'string');
  if (!validStrings || !validHash || !validPositiveInteger(request.maxBytes) ||
      !validPositiveInteger(request.connectTimeoutMs) || !validPositiveInteger(request.idleTimeoutMs) ||
      !Number.isSafeInteger(request.operationAttempt) || request.operationAttempt < 0) {
    artifactError('ARTIFACT_TRANSFER_REQUEST_INVALID', '原生制品传输参数不合法');
  }
}

function validateTransferResult(result: NativeArtifactTransferResult): NativeArtifactTransferResult {
  let partScheme: string;
  let finalScheme: string;
  try {
    partScheme = new URL(result.partUri).protocol;
    finalScheme = new URL(result.finalUrl).protocol;
  } catch {
    artifactError('ARTIFACT_TRANSFER_INVALID', '原生制品传输结果不合法');
  }
  if (partScheme !== 'file:' || finalScheme !== 'https:' || !result.mime?.trim() ||
      !validPositiveInteger(result.byteSize) || !/^[a-f0-9]{64}$/.test(result.sha256)) {
    artifactError('ARTIFACT_TRANSFER_INVALID', '原生制品传输结果不合法');
  }
  return result;
}

export async function transferArtifact(
  request: NativeArtifactTransferRequest,
  module: AutoDLMediaModule | undefined = NativeModules.AutoDLMedia,
): Promise<NativeArtifactTransferResult> {
  const normalizedRequest = { ...request, operationId: request.operationId.trim() };
  validateTransferRequest(normalizedRequest);
  const native = requireArtifactModule(module, 'transferArtifact');
  return validateTransferResult(await native.transferArtifact!(normalizedRequest));
}

export async function cancelArtifactTransfer(
  operationId: string,
  module: AutoDLMediaModule | undefined = NativeModules.AutoDLMedia,
): Promise<boolean> {
  const value = operationId.trim();
  if (!value) artifactError('ARTIFACT_TRANSFER_REQUEST_INVALID', 'operationId 不能为空');
  const native = requireArtifactModule(module, 'cancelArtifactTransfer');
  return native.cancelArtifactTransfer!(value);
}
