import { NativeModules, Platform } from 'react-native';

type AutoDLMediaModule = { openVideo(source: string): void };

export function openNativeVideo(source: string): boolean {
  const module = NativeModules.AutoDLMedia as AutoDLMediaModule | undefined;
  if (Platform.OS !== 'android' || !module || !source.trim()) return false;
  module.openVideo(source);
  return true;
}
