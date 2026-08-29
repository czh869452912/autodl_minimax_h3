import { useState } from 'react';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/icons';
import { COLORS } from '../ui/theme';

export function VideoPlayer({ source, poster }: { source: string; poster?: string }) {
  if (!source.trim()) {
    return <View accessibilityLabel="视频源不可用" style={styles.empty}><AppIcon name="movie_filter" size={30} color={COLORS.textSubtle} /><Text style={styles.emptyText}>视频源不可用</Text></View>;
  }
  return <InlineVideoPlayer source={source} poster={poster} />;
}

function InlineVideoPlayer({ source, poster }: { source: string; poster?: string }) {
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
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

  return <View style={styles.container}>
    <VideoView testID="inline-video-view" player={player} nativeControls contentFit="contain" surfaceType="textureView" useExoShutter={false} fullscreenOptions={{ enable: true, orientation: 'default' }} onFirstFrameRender={() => setHasFirstFrame(true)} style={styles.video} />
    {!hasFirstFrame && poster ? <Image source={{ uri: poster }} style={styles.poster} resizeMode="contain" /> : null}
    {status === 'loading' ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={COLORS.primaryActive} /></View> : null}
    {status === 'error' ? <View style={styles.error}><Text numberOfLines={2} style={styles.errorText}>{error?.message || '视频播放失败'}</Text><Pressable accessibilityRole="button" accessibilityLabel="重试播放" onPress={retry} style={styles.retry}><AppIcon name="refresh" size={18} color={COLORS.text} /><Text style={styles.retryText}>重试播放</Text></Pressable></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1, backgroundColor: '#000' },
  poster: { ...StyleSheet.absoluteFill, width: undefined, height: undefined, backgroundColor: '#000' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  error: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, backgroundColor: '#020617e6' },
  errorText: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },
  retry: { minHeight: 42, paddingHorizontal: 16, borderRadius: 10, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  retryText: { color: COLORS.text, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#111827' },
  emptyText: { color: COLORS.textMuted, fontSize: 13 },
});
