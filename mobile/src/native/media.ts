import { NativeModules, Platform } from 'react-native';

type AutoDLMediaModule = { openVideo(source: string): void; extractPoster(source: string, key: string): Promise<string> };

export function openNativeVideo(source: string): boolean {
  const module = NativeModules.AutoDLMedia as AutoDLMediaModule | undefined;
  if (Platform.OS !== 'android' || !module || !source.trim()) return false;
  module.openVideo(source);
  return true;
}

export async function extractPoster(source: string, key: string): Promise<string | undefined> {
  const module = NativeModules.AutoDLMedia as AutoDLMediaModule | undefined;
  if (Platform.OS !== 'android' || !module || !source.trim()) return undefined;
  return module.extractPoster(source, key);
}
