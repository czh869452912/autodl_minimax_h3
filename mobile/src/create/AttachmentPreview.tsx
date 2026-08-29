import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AppIcon } from '../ui/icons';
import { COLORS, SPACING } from '../ui/theme';
import type { TaskMediaInput } from '../tasks/types';

function AudioRow({ item, index, onRemove }: { item: TaskMediaInput; index: number; onRemove: () => void }) {
  const player = useAudioPlayer(item.dataUri);
  const status = useAudioPlayerStatus(player);
  return <View style={styles.audioRow}><View style={styles.audioTag}><Text style={styles.tagText}>@audio{index}</Text></View><View style={styles.audioCopy}><Text numberOfLines={1} style={styles.name}>{item.name || `参考音频 ${index + 1}`}</Text><Text style={styles.meta}>{status.duration ? `${Math.round(status.duration)} 秒` : '音频参考'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={status.playing ? '暂停音频' : '播放音频'} onPress={() => status.playing ? player.pause() : player.play()} style={styles.iconButton}><AppIcon name={status.playing ? 'pause' : 'play_arrow'} size={20} color={COLORS.primaryActive} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="删除音频" onPress={onRemove} style={styles.iconButton}><AppIcon name="delete" size={20} color={COLORS.danger} /></Pressable></View>;
}

export function ImagePreviewGrid({ items, onRemove }: { items: TaskMediaInput[]; onRemove: (index: number) => void }) {
  if (!items.length) return null;
  return <View style={styles.section}><Text style={styles.sectionLabel}>参考图片列表 (@image0 - @image{items.length - 1})</Text><View style={styles.imageGrid}>{items.map((item, index) => <View key={`${item.name || 'image'}-${index}`} style={styles.imageCard}><Image source={{ uri: item.dataUri }} style={styles.image} /><Text style={styles.imageTag}>@{index}</Text><Pressable accessibilityRole="button" accessibilityLabel={`删除参考图 ${index + 1}`} onPress={() => onRemove(index)} style={styles.remove}><AppIcon name="close" size={15} color={COLORS.text} /></Pressable></View>)}</View></View>;
}

export function AudioPreviewList({ items, onRemove }: { items: TaskMediaInput[]; onRemove: (index: number) => void }) {
  if (!items.length) return null;
  return <View style={styles.section}><Text style={styles.sectionLabel}>参考音频列表 (@audio0 - @audio{items.length - 1})</Text>{items.map((item, index) => <AudioRow key={`${item.name || 'audio'}-${index}`} item={item} index={index} onRemove={() => onRemove(index)} />)}</View>;
}

const styles = StyleSheet.create({ section: { gap: SPACING.sm, marginTop: SPACING.md }, sectionLabel: { color: COLORS.textMuted, fontSize: 12, fontFamily: 'monospace' }, imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }, imageCard: { width: '31%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }, image: { width: '100%', height: '100%' }, imageTag: { position: 'absolute', left: 6, top: 6, color: COLORS.primaryActive, backgroundColor: '#020617cc', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, fontSize: 11 }, remove: { position: 'absolute', right: 5, top: 5, width: 26, height: 26, borderRadius: 13, backgroundColor: '#dc2626dd', alignItems: 'center', justifyContent: 'center' }, audioRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12 }, audioTag: { backgroundColor: COLORS.surfaceRaised, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5 }, tagText: { color: COLORS.primaryActive, fontSize: 11, fontFamily: 'monospace', fontWeight: '700' }, audioCopy: { flex: 1 }, name: { color: COLORS.text, fontSize: 13 }, meta: { color: COLORS.textSubtle, fontSize: 11, marginTop: 3 }, iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' } });
