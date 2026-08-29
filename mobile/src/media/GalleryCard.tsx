import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MediaAsset } from './types';
import { mediaStatusLabel } from '../gallery/presentation';

export function GalleryCard({ asset, onPress, selected = false, onLongPress }: { asset: MediaAsset; onPress: () => void; selected?: boolean; onLongPress?: () => void }) {
  const poster = asset.posterPath;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`打开视频 ${asset.title}`} onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}>
      {poster ? <Image source={{ uri: poster }} style={styles.poster} resizeMode="cover" /> : <View style={styles.posterFallback}><Text style={styles.fallbackText}>{asset.sourceUrl || asset.localPath ? '正在准备首帧…' : '视频就绪'}</Text></View>}
      {selected && <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>}<View style={styles.footer}><Text numberOfLines={2} style={styles.title}>{asset.title || asset.taskId}</Text><Text style={styles.meta}>{asset.durationMs ? `${Math.round(asset.durationMs / 1000)}s` : '—'} · {asset.exportStatus || mediaStatusLabel(asset.status)}</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, overflow: 'hidden', borderRadius: 14, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b' },
  pressed: { opacity: 0.8 },
  selected: { borderColor: '#818cf8', borderWidth: 2 }, check: { position: 'absolute', right: 8, top: 8, width: 25, height: 25, borderRadius: 13, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' }, checkText: { color: '#fff', fontWeight: '900' },
  poster: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#020617' },
  posterFallback: { width: '100%', aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  fallbackText: { color: '#94a3b8', fontSize: 12 },
  footer: { padding: 10 },
  title: { color: '#e2e8f0', fontWeight: '600', fontSize: 13 },
  meta: { color: '#64748b', fontSize: 11, marginTop: 4 },
});
