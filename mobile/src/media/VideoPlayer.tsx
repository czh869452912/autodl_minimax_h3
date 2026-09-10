import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoDecodeMode } from '../settings/videoDecodeMode';
import { AppIcon } from '../ui/icons';
import { COLORS } from '../ui/theme';
import { mediaProbeFailureCode } from './mediaValidation';
import { openExternalVideo, UnifiedVideoView, type UnifiedPlaybackEvent } from './unifiedPlayback';

type VideoPlayerProps = {
  source: string;
  poster?: string;
  validateSource?: (source: string) => Promise<unknown>;
  onInvalidSource?: (source: string) => void | Promise<void>;
  recovering?: boolean;
};

type FailureState = 'none' | 'checking' | 'recoverable' | 'invalid';

const CORRUPT_MEDIA_CODES = new Set([
  'MEDIA_INVALID',
  'MEDIA_NAL_INVALID',
  'MEDIA_SAMPLE_INVALID',
  'MEDIA_NO_VIDEO_TRACK',
  'MEDIA_DURATION_INVALID',
]);

function isLocalSource(source: string): boolean {
  return /^(file|content):/.test(source);
}

export function VideoPlayer({ source, poster, validateSource, onInvalidSource, recovering = false }: VideoPlayerProps) {
  if (!source.trim()) {
    return <View accessibilityLabel="视频源不可用" style={styles.empty}><AppIcon name="movie_filter" size={30} color={COLORS.textSubtle} /><Text style={styles.emptyText}>视频源不可用</Text></View>;
  }
  return <PlaybackHost source={source} poster={poster} validateSource={validateSource} onInvalidSource={onInvalidSource} recovering={recovering} />;
}

function PlaybackHost({ source, poster, validateSource, onInvalidSource, recovering }: Required<Pick<VideoPlayerProps, 'source' | 'recovering'>> & Omit<VideoPlayerProps, 'source' | 'recovering'>) {
  const decodeMode = useVideoDecodeMode();
  const [retry, setRetry] = useState({ source, token: 0 });
  const [visual, setVisual] = useState({ source, firstFrame: false, status: 'loading' as UnifiedPlaybackEvent['status'], failure: 'none' as FailureState });
  const validationSequence = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    validationSequence.current += 1;
    setRetry({ source, token: 0 });
    setVisual({ source, firstFrame: false, status: 'loading', failure: 'none' });
  }, [source]);

  const currentVisual = visual.source === source
    ? visual
    : { source, firstFrame: false, status: 'loading' as const, failure: 'none' as const };
  const retryToken = retry.source === source ? retry.token : 0;
  const activePlayback = useRef({ source, retryToken });
  useLayoutEffect(() => {
    activePlayback.current = { source, retryToken };
  }, [source, retryToken]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      validationSequence.current += 1;
    };
  }, []);

  const handlePlayback = useCallback(({ nativeEvent }: { nativeEvent: UnifiedPlaybackEvent }) => {
    const expected = { source, retryToken };
    if (nativeEvent.source !== expected.source || nativeEvent.retryToken !== expected.retryToken ||
        activePlayback.current.source !== expected.source || activePlayback.current.retryToken !== expected.retryToken) {
      return;
    }
    const { status } = nativeEvent;
    if (status === 'firstFrame') {
      validationSequence.current += 1;
      setVisual({ source, firstFrame: true, status, failure: 'none' });
      return;
    }
    if (status !== 'decodeFailed' && status !== 'sourceUnavailable') {
      setVisual(current => current.source === source ? { ...current, status } : current);
      return;
    }

    if (!isLocalSource(source) || !validateSource) {
      setVisual(current => ({ source, firstFrame: current.source === source && current.firstFrame, status, failure: 'recoverable' }));
      return;
    }

    const sequence = ++validationSequence.current;
    setVisual(current => ({ source, firstFrame: current.source === source && current.firstFrame, status, failure: 'checking' }));
    void validateSource(source).then(
      () => {
        if (mounted.current && validationSequence.current === sequence &&
            activePlayback.current.source === expected.source && activePlayback.current.retryToken === expected.retryToken) {
          setVisual(current => ({ source, firstFrame: current.source === source && current.firstFrame, status, failure: 'recoverable' }));
        }
      },
      cause => {
        if (!mounted.current || validationSequence.current !== sequence ||
            activePlayback.current.source !== expected.source || activePlayback.current.retryToken !== expected.retryToken) return;
        const failure = CORRUPT_MEDIA_CODES.has(mediaProbeFailureCode(cause) ?? '') ? 'invalid' : 'recoverable';
        setVisual(current => ({ source, firstFrame: current.source === source && current.firstFrame, status, failure }));
      },
    );
  }, [retryToken, source, validateSource]);

  const retryPlayback = () => {
    validationSequence.current += 1;
    setVisual({ source, firstFrame: false, status: 'loading', failure: 'none' });
    setRetry(current => ({ source, token: current.source === source ? current.token + 1 : 1 }));
  };

  if (!decodeMode) {
    return <View style={styles.empty}><ActivityIndicator color={COLORS.primaryActive} /></View>;
  }

  const failed = currentVisual.failure === 'recoverable' || currentVisual.failure === 'invalid';
  return <View style={styles.container}>
    <UnifiedVideoView testID="unified-video-view" source={source} decodeMode={decodeMode} retryToken={retryToken} onPlayback={handlePlayback} style={styles.video} />
    {!currentVisual.firstFrame && poster ? <View testID="video-poster" pointerEvents="none" style={styles.poster}><Image source={{ uri: poster }} style={styles.posterImage} resizeMode="contain" /></View> : null}
    {currentVisual.status === 'loading' && currentVisual.failure === 'none' ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={COLORS.primaryActive} /></View> : null}
    {currentVisual.failure === 'checking' ? <View style={styles.error}><Text style={styles.errorText}>正在检查本地视频文件</Text><ActivityIndicator color={COLORS.primaryActive} /></View> : null}
    {failed ? <View style={styles.error}>
      <Text numberOfLines={2} style={styles.errorText}>{currentVisual.failure === 'invalid' ? '本地视频文件已损坏' : '视频播放失败，原件未被判定为损坏'}</Text>
      {currentVisual.failure === 'invalid' && onInvalidSource
        ? <Pressable accessibilityRole="button" accessibilityLabel="重新下载视频" disabled={recovering} onPress={() => void onInvalidSource(source)} style={[styles.retry, recovering && styles.disabled]}><AppIcon name="refresh" size={18} color={COLORS.onPrimary} /><Text style={styles.retryText}>{recovering ? '重新下载中…' : '重新下载'}</Text></Pressable>
        : <Pressable accessibilityRole="button" accessibilityLabel="重试播放" onPress={retryPlayback} style={styles.retry}><AppIcon name="refresh" size={18} color={COLORS.onPrimary} /><Text style={styles.retryText}>重试播放</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="使用外部播放器打开" onPress={() => void openExternalVideo(source).catch(() => Alert.alert('无法打开', '没有可用的外部播放器，或原件已不可访问'))} style={styles.retry}><Text style={styles.retryText}>使用外部播放器</Text></Pressable>
    </View> : null}
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
