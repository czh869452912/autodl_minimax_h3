import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface VideoPlayerProps {
  source: string;
  poster?: string;
  autoPlay?: boolean;
  controls?: boolean;
  onFirstFrame?: () => void;
  onError?: (error: Error) => void;
}

export interface VideoPlayerHandle {
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  enterFullscreen(): Promise<void>;
  exitFullscreen(): Promise<void>;
}

export type VideoPlayerComponent = React.ForwardRefExoticComponent<VideoPlayerProps & React.RefAttributes<VideoPlayerHandle>>;

/** Production builds replace this implementation with the Media3 Fabric view. */
export const Media3Player = React.forwardRef<VideoPlayerHandle, VideoPlayerProps>(function Media3Player({ source, poster, onError }, _ref) {
  if (!source) {
    onError?.(new Error('Video source is empty'));
    return <View style={styles.empty}><Text style={styles.text}>暂无可用视频</Text></View>;
  }
  return <View accessibilityLabel="Media3 video player" style={styles.container}><Text style={styles.text}>{poster ? 'Media3 poster ready' : 'Media3 player ready'}</Text></View>;
});

const styles = StyleSheet.create({
  container: { minHeight: 240, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 240, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  text: { color: '#cbd5e1' },
});
