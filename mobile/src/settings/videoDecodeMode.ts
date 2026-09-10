import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export type VideoDecodeMode = 'auto' | 'hardware' | 'software';
export const VIDEO_DECODE_MODE_KEY = 'media.videoDecodeMode';
export const videoDecodeOptions = [
  { value: 'auto', label: '自动', help: '优先使用设备解码；不支持或播放失败时切换软件解码。' },
  { value: 'hardware', label: '硬解码', help: '仅使用硬件视频解码器；设备不支持时提示失败，不自动切换。' },
  { value: 'software', label: '软解码', help: '使用 LibVLC 软件解码原件，适合 High 10 等设备不支持的编码，耗电可能更高。' },
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
