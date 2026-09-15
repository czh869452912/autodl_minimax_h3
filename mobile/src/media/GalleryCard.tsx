import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MediaAsset } from './types';
import { mediaExportStatusLabel, mediaStatusLabel } from '../gallery/presentation';
import { AppIcon } from '../ui/icons';
import { COLORS } from '../ui/theme';

export function GalleryCard({ asset, onPress, selected = false, onLongPress, width }: { width?: number; asset: MediaAsset; onPress: () => void; selected?: boolean; onLongPress?: () => void }) {
  const poster = asset.posterPath;
  const publication = mediaExportStatusLabel(asset.exportStatus);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`打开视频 ${asset.title}`} accessibilityState={{ selected }} accessibilityActions={onLongPress ? [{ name: 'longpress', label: selected ? '取消选择' : '选择作品' }] : undefined} onAccessibilityAction={() => onLongPress?.()} onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.card, width !== undefined && { width, flex: 0, maxWidth: '100%' }, selected && styles.selected, pressed && styles.pressed]}>
      {poster ? <Image source={{ uri: poster }} style={styles.poster} resizeMode="contain" /> : <View style={styles.posterFallback}><AppIcon name="movie_filter" size={28} color={COLORS.textMuted} /><Text style={styles.fallbackText}>{asset.sourceUrl || asset.localPath ? '正在准备首帧…' : '视频源不可用'}</Text></View>}
      {selected && <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>}<View style={styles.footer}><Text numberOfLines={2} style={styles.title}>{asset.title || asset.taskId}</Text><Text style={styles.meta}>{asset.durationMs ? `${Math.round(asset.durationMs / 1000)}s` : '—'} · {publication || mediaStatusLabel(asset.status)}</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, maxWidth: '50%', overflow: 'hidden', borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border },
  pressed: { opacity: 0.8 },
  selected: { borderColor: COLORS.primaryActive }, check: { position: 'absolute', right: 8, top: 8, width: 25, height: 25, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }, checkText: { color: COLORS.onPrimary, fontWeight: '900' },
  poster: { width: '100%', aspectRatio: 16 / 9, backgroundColor: COLORS.mediaBackground },
  posterFallback: { width: '100%', aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, backgroundColor: COLORS.surfaceRaised },
  fallbackText: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  footer: { padding: 12, gap: 4 },
  title: { color: COLORS.text, fontWeight: '700', fontSize: 13, lineHeight: 20 },
  meta: { color: COLORS.textSubtle, fontSize: 12, lineHeight: 18, marginTop: 4 },
});
