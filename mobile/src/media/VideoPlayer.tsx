import { useEffect, useState } from 'react';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/icons';
import { COLORS } from '../ui/theme';

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
  return <InlineVideoPlayer source={source} poster={poster} validateSource={validateSource} onInvalidSource={onInvalidSource} recovering={recovering} />;
}

function InlineVideoPlayer({ source, poster, validateSource, onInvalidSource, recovering }: VideoPlayerProps & { recovering: boolean }) {
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const [validation, setValidation] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const player = useVideoPlayer(source, (instance) => {
    instance.muted = false;
    instance.loop = false;
    instance.keepScreenOnWhilePlaying = true;
    instance.bufferOptions = { minBufferForPlayback: 2, preferredForwardBufferDuration: 20 };
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  const retry = () => {
    setHasFirstFrame(false);
    player.replay();
    player.play();
  };
  useEffect(() => {
    let current = true;
    setValidation('idle');
    if (status !== 'error' || !source.startsWith('file://') || !validateSource) return () => { current = false; };
    setValidation('checking');
    void validateSource(source).then(
      () => { if (current) setValidation('valid'); },
      (cause: unknown) => {
        if (!current) return;
        const code = cause && typeof cause === 'object' ? (cause as { code?: unknown }).code : undefined;
        setValidation(code === 'MEDIA_INVALID' ? 'invalid' : 'valid');
      },
    );
    return () => { current = false; };
  }, [source, status, validateSource]);

  return <View style={styles.container}>
    <VideoView testID="inline-video-view" player={player} nativeControls contentFit="contain" surfaceType="textureView" useExoShutter={false} fullscreenOptions={{ enable: true, orientation: 'default' }} onFirstFrameRender={() => setHasFirstFrame(true)} style={styles.video} />
    {!hasFirstFrame && poster ? <View testID="video-poster" pointerEvents="none" style={styles.poster}><Image source={{ uri: poster }} style={styles.posterImage} resizeMode="contain" /></View> : null}
    {status === 'loading' ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={COLORS.primaryActive} /></View> : null}
    {status === 'error' ? <View style={styles.error}><Text numberOfLines={2} style={styles.errorText}>{validation === 'invalid' ? '本地视频文件已损坏' : '视频播放失败'}</Text>{validation === 'checking' ? <ActivityIndicator color={COLORS.primaryActive} /> : validation === 'invalid' && onInvalidSource ? <Pressable accessibilityRole="button" accessibilityLabel="重新下载视频" disabled={recovering} onPress={() => void onInvalidSource(source)} style={[styles.retry, recovering && styles.disabled]}><AppIcon name="refresh" size={18} color={COLORS.text} /><Text style={styles.retryText}>{recovering ? '重新下载中…' : '重新下载'}</Text></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel="重试播放" onPress={retry} style={styles.retry}><AppIcon name="refresh" size={18} color={COLORS.text} /><Text style={styles.retryText}>重试播放</Text></Pressable>}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1, backgroundColor: '#000' },
  poster: { ...StyleSheet.absoluteFill, width: undefined, height: undefined, backgroundColor: '#000' },
  posterImage: { flex: 1 },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  error: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, backgroundColor: '#020617e6' },
  errorText: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },
  retry: { minHeight: 42, paddingHorizontal: 16, borderRadius: 10, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  retryText: { color: COLORS.text, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#111827' },
  emptyText: { color: COLORS.textMuted, fontSize: 13 },
});
