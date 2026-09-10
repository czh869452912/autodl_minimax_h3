import { useVideoDecodeMode, type VideoDecodeMode } from '../settings/videoDecodeMode';
import { mediaProbeFailureCode } from './mediaValidation';
import { useEffect, useState } from 'react';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/icons';
import { COLORS } from '../ui/theme';
import { canUseSoftwarePlayback, canAutomaticallyDecodeLocally, preferSoftwarePlayback, openExternalVideo, SoftwareVideoView, HardwareVideoView } from './softwarePlayback';

type VideoPlayerProps = {
  source: string;
  poster?: string;
  validateSource?: (source: string) => Promise<unknown>;
  onInvalidSource?: (source: string) => void | Promise<void>;
  recovering?: boolean;
};

export function VideoPlayer({ source, poster, validateSource, onInvalidSource, recovering = false }: VideoPlayerProps) {
  if (!source.trim()) {
    return <View accessibilityLabel="视频源不可用" style={styles.empty}><AppIcon name="movie_filter" size={30} color={COLORS.textSubtle} /><Text style={styles.emptyText}>视频源不可用</Text></View>;
  }
  return <PlaybackHost key={source} source={source} poster={poster} validateSource={validateSource} onInvalidSource={onInvalidSource} recovering={recovering} />;
}

function PlaybackHost(props: VideoPlayerProps & { recovering: boolean }) {
  return canUseSoftwarePlayback(props.source) ? <ConfiguredPlayback {...props} /> : <AutomaticPlayback {...props} />;
}
function ConfiguredPlayback(props: VideoPlayerProps & { recovering: boolean }) {
  const mode = useVideoDecodeMode();
  if (canUseSoftwarePlayback(props.source)) {
    if (!mode) return <View style={styles.empty}><ActivityIndicator /></View>;
    if (mode !== 'auto') return <SoftwarePlayer key={mode} source={props.source} poster={props.poster} initialPositionMs={0} mode={mode} />;
  }
  return <AutomaticPlayback key={mode ?? 'auto'} {...props} />;
}
function AutomaticPlayback(props: VideoPlayerProps & { recovering: boolean }) {
  const [backend, setBackend] = useState<'checking' | 'media3' | 'software'>(() => canAutomaticallyDecodeLocally(props.source) ? 'checking' : 'media3');
  const [positionMs, setPositionMs] = useState(0);
  useEffect(() => {
    if (!canAutomaticallyDecodeLocally(props.source)) return;
    let current = true;
    const timeout = setTimeout(() => { if (current) { current = false; setBackend('media3'); } }, 1500);
    void preferSoftwarePlayback(props.source).then(prefer => { if (current) { current = false; clearTimeout(timeout); setBackend(prefer ? 'software' : 'media3'); } });
    return () => { current = false; clearTimeout(timeout); };
  }, [props.source]);
  if (backend === 'checking') return <View style={styles.empty}><ActivityIndicator color={COLORS.primary} /></View>;
  if (backend === 'software') return <SoftwarePlayer source={props.source} poster={props.poster} initialPositionMs={positionMs} />;
  return <InlineVideoPlayer {...props} onSoftwareFallback={canAutomaticallyDecodeLocally(props.source) ? position => {
    setPositionMs(Number.isFinite(position) ? Math.max(0, position * 1000) : 0);
    setBackend('software');
  } : undefined} />;
}

function SoftwarePlayer({ source, poster, initialPositionMs, mode = 'software' }: { source: string; poster?: string; initialPositionMs: number; mode?: VideoDecodeMode }) {
  const NativePlayer = mode === 'hardware' ? HardwareVideoView : SoftwareVideoView;
  const [attempt, setAttempt] = useState(0);
  const [frame, setFrame] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (frame || failed) return;
    const timeout = setTimeout(() => setFailed(true), 15_000);
    return () => clearTimeout(timeout);
  }, [attempt, frame, failed]);
  return <View style={styles.container}>
    {!failed ? <NativePlayer key={attempt} testID={mode === 'hardware' ? 'hardware-video-view' : 'software-video-view'} source={source} initialPositionMs={initialPositionMs} style={styles.video} onPlayback={({ nativeEvent }) => {
      if (nativeEvent.status === 'firstFrame') setFrame(true);
      if (nativeEvent.status === 'decodeFailed' || nativeEvent.status === 'sourceUnavailable') setFailed(true);
    }} /> : null}
    {!frame && poster ? <View pointerEvents="none" style={styles.poster}><Image source={{ uri: poster }} style={styles.posterImage} resizeMode="contain" /></View> : null}
    {!frame && !failed ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={COLORS.primaryActive} /></View> : null}
    {failed ? <View style={styles.error}><Text style={styles.errorText}>{mode === 'hardware' ? '硬件解码失败，请在设置中选择自动或软解码' : '此视频暂时无法在应用内播放，原件仍可保存到相册'}</Text><Pressable accessibilityRole="button" accessibilityLabel="重试兼容播放" style={styles.retry} onPress={() => { setFrame(false); setFailed(false); setAttempt(value => value + 1); }}><Text style={styles.retryText}>重试播放</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="使用外部播放器打开" style={styles.retry} onPress={() => void openExternalVideo(source).catch(() => Alert.alert('无法打开', '没有可用的外部播放器，或原件已不可访问'))}><Text style={styles.retryText}>使用外部播放器</Text></Pressable></View> : null}
  </View>;
}

function InlineVideoPlayer({ source, poster, validateSource, onInvalidSource, recovering, onSoftwareFallback }: VideoPlayerProps & { recovering: boolean; onSoftwareFallback?: (position: number) => void }) {
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const [validation, setValidation] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'unsupported' | 'decodeFailed'>('idle');
  const player = useVideoPlayer(source, (instance) => {
    instance.muted = false;
    instance.loop = false;
    instance.keepScreenOnWhilePlaying = true;
    instance.bufferOptions = { minBufferForPlayback: 2, preferredForwardBufferDuration: 20 };
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  useEffect(() => {
    if (!/^(file|content):\/\//.test(source) || hasFirstFrame || validation === 'invalid' || !onSoftwareFallback || (status !== 'loading' && !isPlaying)) return;
    const timer = setTimeout(() => { player.pause(); onSoftwareFallback(player.currentTime); }, 15_000);
    return () => clearTimeout(timer);
  }, [source, hasFirstFrame, validation, status, isPlaying, onSoftwareFallback, player]);
  const retry = () => {
    setHasFirstFrame(false);
    player.replay();
    player.play();
  };
  useEffect(() => {
    let current = true;
    setValidation('idle');
    if (status !== 'error' || !/^(file|content):\/\//.test(source)) return () => { current = false; };
    const fallback = () => { if (current && onSoftwareFallback) { player.pause(); onSoftwareFallback(player.currentTime); } };
    if (!/^(file|content):\/\//.test(source) || !validateSource) { fallback(); return () => { current = false; }; }
    setValidation('checking');
    void validateSource(source).then(
      () => { if (current) { setValidation('valid'); fallback(); } },
      (cause: unknown) => {
        if (!current) return;
        const code = mediaProbeFailureCode(cause);
        setValidation(code === 'MEDIA_CODEC_UNSUPPORTED' ? 'unsupported' : code === 'MEDIA_DECODE_FAILED' ? 'decodeFailed' : code === 'MEDIA_INVALID' || ['MEDIA_NAL_INVALID', 'MEDIA_SAMPLE_INVALID', 'MEDIA_NO_VIDEO_TRACK', 'MEDIA_DURATION_INVALID'].includes(code ?? '') ? 'invalid' : 'valid');
        if (!['MEDIA_INVALID', 'MEDIA_NAL_INVALID', 'MEDIA_SAMPLE_INVALID', 'MEDIA_NO_VIDEO_TRACK', 'MEDIA_DURATION_INVALID'].includes(code ?? '')) fallback();
      },
    );
    return () => { current = false; };
  }, [source, status, validateSource]);

  return <View style={styles.container}>
    <VideoView testID="inline-video-view" player={player} nativeControls contentFit="contain" surfaceType="textureView" useExoShutter={false} fullscreenOptions={{ enable: true, orientation: 'default' }} onFirstFrameRender={() => setHasFirstFrame(true)} style={styles.video} />
    {!hasFirstFrame && poster ? <View testID="video-poster" pointerEvents="none" style={styles.poster}><Image source={{ uri: poster }} style={styles.posterImage} resizeMode="contain" /></View> : null}
    {status === 'loading' ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={COLORS.primaryActive} /></View> : null}
    {status === 'error' ? <View style={styles.error}><Text numberOfLines={2} style={styles.errorText}>{validation === 'unsupported' ? '当前设备不支持此视频编码，重新下载无法解决' : validation === 'decodeFailed' ? '设备解码失败，尚不能确定文件损坏' : validation === 'invalid' ? '本地视频文件已损坏' : '视频播放失败'}</Text>{validation === 'unsupported' ? null : validation === 'checking' ? <ActivityIndicator color={COLORS.primaryActive} /> : validation === 'invalid' && onInvalidSource ? <Pressable accessibilityRole="button" accessibilityLabel="重新下载视频" disabled={recovering} onPress={() => void onInvalidSource(source)} style={[styles.retry, recovering && styles.disabled]}><AppIcon name="refresh" size={18} color={COLORS.onPrimary} /><Text style={styles.retryText}>{recovering ? '重新下载中…' : '重新下载'}</Text></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel="重试播放" onPress={retry} style={styles.retry}><AppIcon name="refresh" size={18} color={COLORS.onPrimary} /><Text style={styles.retryText}>重试播放</Text></Pressable>}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.mediaBackground },
  video: { flex: 1, backgroundColor: COLORS.mediaBackground },
  poster: { ...StyleSheet.absoluteFill, width: undefined, height: undefined, backgroundColor: COLORS.mediaBackground },
  posterImage: { flex: 1 },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  error: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, backgroundColor: COLORS.surface },
  errorText: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },
  retry: { minHeight: 48, paddingHorizontal: 16, borderRadius: 10, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  retryText: { color: COLORS.onPrimary, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.surfaceRaised },
  emptyText: { color: COLORS.textMuted, fontSize: 13 },
});
