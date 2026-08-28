import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { MediaAsset } from './types';

export function GalleryCard({ asset, onPress }: { asset: MediaAsset; onPress: () => void }) {
  const source = asset.localPath || asset.sourceUrl;
  const player = useVideoPlayer(source ? source : null, (instance) => { instance.muted = true; });
  const poster = useMemo(() => asset.posterPath, [asset.posterPath]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`打开视频 ${asset.title}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {poster ? <Image source={{ uri: poster }} style={styles.poster} resizeMode="cover" /> : player ? <VideoView player={player} nativeControls={false} contentFit="cover" useExoShutter style={styles.poster} /> : <View style={styles.posterFallback}><Text style={styles.fallbackText}>{asset.sourceUrl || asset.localPath ? '正在准备首帧…' : '视频就绪'}</Text></View>}
      <View style={styles.footer}><Text numberOfLines={1} style={styles.title}>{asset.title || asset.taskId}</Text><Text style={styles.meta}>{asset.durationMs ? `${Math.round(asset.durationMs / 1000)}s` : '—'} · {asset.status}</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, overflow: 'hidden', borderRadius: 14, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b' },
  pressed: { opacity: 0.8 },
  poster: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#020617' },
  posterFallback: { width: '100%', aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  fallbackText: { color: '#94a3b8', fontSize: 12 },
  footer: { padding: 10 },
  title: { color: '#e2e8f0', fontWeight: '600', fontSize: 13 },
  meta: { color: '#64748b', fontSize: 11, marginTop: 4 },
});
