import { NativeModules, requireNativeComponent, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import type { VideoDecodeMode } from '../settings/videoDecodeMode';

export type UnifiedPlaybackEvent = {
  status: 'loading' | 'firstFrame' | 'playing' | 'paused' | 'ended' | 'decodeFailed' | 'sourceUnavailable';
  positionMs: number;
  source: string;
  retryToken: number;
};

export type UnifiedVideoViewProps = ViewProps & {
  source: string;
  decodeMode: VideoDecodeMode;
  retryToken: number;
  onPlayback(event: NativeSyntheticEvent<UnifiedPlaybackEvent>): void;
};

const NativeUnifiedVideoView = requireNativeComponent<UnifiedVideoViewProps>('AutoDLVideoView');

export function UnifiedVideoView(props: UnifiedVideoViewProps) {
  return <NativeUnifiedVideoView {...props} />;
}

export async function openExternalVideo(source: string): Promise<void> {
  await NativeModules.AutoDLMedia.openExternalVideo(source);
}
