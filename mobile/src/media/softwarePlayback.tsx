import { NativeModules, Platform, requireNativeComponent, type NativeSyntheticEvent, type ViewProps } from 'react-native';

export function canUseSoftwarePlayback(source: string): boolean {
  return Platform.OS === 'android' && NativeModules.AutoDLMedia?.softwareVideoPlayback === true && /^(file|content):\/\//.test(source);
}

export async function preferSoftwarePlayback(source: string): Promise<boolean> {
  if (!canUseSoftwarePlayback(source)) return false;
  try { return (await NativeModules.AutoDLMedia.videoPlaybackInfo(source))?.preferSoftware === true; }
  catch { return false; } // Metadata is a hint, never proof of corrupt bytes.
}

export async function openExternalVideo(source: string): Promise<void> {
  await NativeModules.AutoDLMedia.openExternalVideo(source);
}

export type SoftwarePlaybackEvent = { status: 'playing' | 'progress' | 'firstFrame' | 'ended' | 'decodeFailed' | 'sourceUnavailable'; positionMs: number };
type Props = ViewProps & { source: string; initialPositionMs: number; onPlayback(event: NativeSyntheticEvent<SoftwarePlaybackEvent>): void };
let NativeView: ReturnType<typeof requireNativeComponent<Props>> | undefined;
export function SoftwareVideoView(props: Props) {
  NativeView ??= requireNativeComponent<Props>('AutoDLLibVlcView');
  return <NativeView {...props} />;
}
