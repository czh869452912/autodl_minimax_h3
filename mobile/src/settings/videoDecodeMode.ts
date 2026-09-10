import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export type VideoDecodeMode = 'auto' | 'hardware' | 'software';
export const VIDEO_DECODE_MODE_KEY = 'media.videoDecodeMode';
export const videoDecodeOptions = [
  { value: 'auto', label: '自动', help: '优先使用硬件解码，必要时使用软件解码。' },
  { value: 'hardware', label: '硬解码', help: '仅使用硬件解码；设备不支持时会提示播放失败。' },
  { value: 'software', label: '软解码', help: '使用软件解码原件，兼容性更高，但耗电可能增加。' },
] as const;
export function normalizeVideoDecodeMode(value: unknown): VideoDecodeMode {
  return value === 'hardware' || value === 'software' ? value : 'auto';
}
const listeners = new Set<(mode: VideoDecodeMode) => void>();
export function publishVideoDecodeMode(mode: VideoDecodeMode) { listeners.forEach(listener => listener(mode)); }
export function useVideoDecodeMode() {
  const [mode, setMode] = useState<VideoDecodeMode | undefined>();
  useEffect(() => {
    let current = true;
    let updated = false;
    const listener = (next: VideoDecodeMode) => { updated = true; setMode(next); };
    listeners.add(listener);
    void SecureStore.getItemAsync(VIDEO_DECODE_MODE_KEY).then(value => {
      if (current && !updated) setMode(normalizeVideoDecodeMode(value));
    }, () => { if (current && !updated) setMode('auto'); });
    return () => { current = false; listeners.delete(listener); };
  }, []);
  return mode;
}
