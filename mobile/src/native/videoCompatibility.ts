import { NativeModules, Platform } from 'react-native';

export type CompatibleVideoRequest = Readonly<{
  sourceUri: string;
  sourceSha256: string;
  operationId: string;
  operationAttempt: number;
  maxBytes: number;
}>;

export type CompatibleVideoResult = Readonly<{
  partUri: string;
  mime: string;
  byteSize: number;
  sha256: string;
}>;

type CompatibilityModule = {
  prepareCompatibleVideo(request: CompatibleVideoRequest): Promise<CompatibleVideoResult>;
  cancelCompatibleVideo(operationId: string, operationAttempt: number): Promise<boolean>;
};

function native(): CompatibilityModule {
  const module = NativeModules.AutoDLMedia as Partial<CompatibilityModule> | undefined;
  if (Platform.OS !== 'android' || !module?.prepareCompatibleVideo || !module.cancelCompatibleVideo) {
    throw Object.assign(new Error('当前设备不支持本地视频兼容处理'), { code: 'MEDIA_COMPATIBILITY_UNAVAILABLE' });
  }
  return module as CompatibilityModule;
}

export function prepareCompatibleVideo(request: CompatibleVideoRequest): Promise<CompatibleVideoResult> {
  return native().prepareCompatibleVideo(request);
}

export function cancelCompatibleVideo(operationId: string, operationAttempt: number): Promise<boolean> {
  return native().cancelCompatibleVideo(operationId, operationAttempt);
}
