import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { openDatabaseSync } from 'expo-sqlite';
import { createTaskRepository } from '../../src/tasks/repository';
import type { TaskRecord } from '../../src/tasks/types';
import { exportStatusLabel, mediaSource, mediaStatusLabel } from '../../src/gallery/presentation';
import { exportTaskVideo } from '../../src/tasks/media';
import { VideoPlayer } from '../../src/media/VideoPlayer';
import { AppIcon } from '../../src/ui/icons';
import { COLORS, SPACING } from '../../src/ui/theme';
import { readSettings } from '../../src/settings/storage';
import { createSqliteMediaStore } from '../../src/media/repository';
import type { MediaAsset } from '../../src/media/types';

const store = createTaskRepository(openDatabaseSync('autodl-h3.db'));
const mediaStore = createSqliteMediaStore(openDatabaseSync('autodl-h3.db'));

export default function VideoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!id) { setLoaded(true); return; }
    void mediaStore.get(id).then(async (media) => { setAsset(media); const taskId = media?.taskId || id; const items = await store.list(); setTask(items.find((item) => item.id === taskId) || null); }).finally(() => setLoaded(true));
  }, [id]);

  if (!loaded) return <View style={styles.center}><ActivityIndicator color={COLORS.primaryActive} /><Text style={styles.muted}>正在加载作品…</Text></View>;
  if (!task) return <View style={styles.center}><Text style={styles.title}>作品不存在或已删除</Text><Pressable accessibilityRole="button" accessibilityLabel="返回画廊" onPress={() => router.back()} style={styles.backAction}><Text style={styles.backGlyph}>‹</Text><Text style={styles.backActionText}>返回画廊</Text></Pressable></View>;

  const source = asset?.localPath || asset?.sourceUrl || mediaSource(task);
  const copyPrompt = async () => {
    if (!task.prompt.trim()) { Alert.alert('无法复制', '当前作品没有 Prompt'); return; }
    try {
      await Clipboard.setStringAsync(task.prompt);
      const copied = await Clipboard.getStringAsync();
      if (copied !== task.prompt) {
        Alert.alert('复制不完整', '系统剪贴板未保留完整 Prompt，可能是键盘剪贴板或目标应用的长度限制。');
        return;
      }
      Alert.alert('已复制', 'Prompt 已复制到剪贴板');
    } catch {
      Alert.alert('复制失败', '无法写入剪贴板，请稍后重试');
    }
  };
  const saveToGallery = async () => {
    if (!task || exporting || !source) return;
    setExporting(true);
    try {
      const settings = await readSettings();
      let current = task;
      const updated = await exportTaskVideo({ ...task, videoUrl: asset?.sourceUrl || task.videoUrl, localUri: asset?.localPath || task.localUri }, { policy: { autoExportToGallery: settings.autoExportToGallery, keepPrivateCopy: true }, onUpdate: async (patch) => { current = { ...current, ...patch }; await store.upsert(current); setTask(current); } });
      await store.upsert(updated);
      setTask(updated);
      if (asset) { const nextAsset = { ...asset, localPath: updated.localUri || asset.localPath, status: (updated.localUri || asset.localPath ? 'downloaded' : asset.status) as MediaAsset['status'], updatedAt: Date.now() }; await mediaStore.upsert(nextAsset); setAsset(nextAsset); await mediaStore.upsertDelivery?.({ id: `${asset.id}:system-gallery`, assetId: asset.id, target: 'system-gallery', uri: updated.galleryUri, status: updated.exportState === 'EXPORTED' ? 'EXPORTED' : 'FAILED', error: updated.exportError, createdAt: Date.now(), updatedAt: Date.now() }); }
      Alert.alert('已保存', '视频已保存到系统相册 / Movies / AutoDL-H3');
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '保存到系统相册失败');
    } finally { setExporting(false); }
  };

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><ScrollView testID="detail-content" style={styles.container} contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回画廊" onPress={() => router.back()} hitSlop={10} style={styles.back}><Text style={styles.backGlyph}>‹</Text><Text style={styles.backText}>返回画廊</Text></Pressable><Text style={styles.title}>视频详情</Text></View>
    <View testID="adaptive-media-region" style={styles.mediaRegion}><View testID="video-frame" style={styles.player}>{source ? <VideoPlayer source={source} poster={asset?.posterPath || task.thumbnailUrl} /> : <View accessibilityLabel="视频源不可用" style={styles.sourceEmpty}><AppIcon name="movie_filter" size={30} color={COLORS.textSubtle} /><Text style={styles.sourceEmptyText}>视频源不可用</Text></View>}</View></View>
    <Text style={styles.meta}>{task.resolution} · {task.duration}s · {task.status} · {task.downloadState === 'DOWNLOADED' ? '已下载' : mediaStatusLabel(task.localUri ? 'downloaded' : task.downloadState === 'DOWNLOAD_FAILED' ? 'failed' : 'downloading')}</Text>
    {source ? <View style={styles.exportRow}><Text style={styles.exportStatus}>{exporting ? '正在保存到相册' : exportStatusLabel(task) || '尚未保存到相册'}</Text>{task.exportState !== 'EXPORTED' && <Pressable accessibilityRole="button" accessibilityLabel={task.exportState === 'EXPORT_FAILED' ? '重试保存到系统相册' : '保存到系统相册'} disabled={exporting} onPress={() => void saveToGallery()} style={[styles.exportButton, exporting && styles.disabled]}><Text style={styles.exportButtonText}>{exporting ? '保存中…' : task.exportState === 'EXPORT_FAILED' ? '重试保存到系统相册' : '保存到系统相册'}</Text></Pressable>}</View> : null}
    <View testID="bottom-prompt-card" style={styles.promptCard}><View style={styles.promptHeader}><Text style={styles.sectionTitle}>Prompt</Text><Text style={styles.promptCount}>{task.prompt.length.toLocaleString()} 字符</Text></View><ScrollView accessibilityLabel="滚动 Prompt" nestedScrollEnabled style={styles.promptScroll}><Text selectable style={styles.prompt}>{task.prompt || '暂无 Prompt'}</Text></ScrollView><Pressable accessibilityRole="button" accessibilityLabel="复制 Prompt" onPress={() => void copyPrompt()} style={styles.copy}><AppIcon name="content_copy" size={18} color={COLORS.text} /><Text style={styles.copyText}>复制 Prompt</Text></Pressable></View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background }, container: { flex: 1, backgroundColor: COLORS.background }, content: { flexGrow: 1, padding: SPACING.lg, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: COLORS.background, padding: SPACING.xl }, muted: { color: COLORS.textMuted },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, marginBottom: SPACING.lg }, back: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5 }, backText: { color: COLORS.primaryActive, fontSize: 14, fontWeight: '700' }, title: { color: COLORS.text, fontSize: 24, fontWeight: '800' },
  mediaRegion: { flex: 1, minHeight: 240 }, player: { flex: 1, minHeight: 220, width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }, sourceEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.surface }, sourceEmptyText: { color: COLORS.textMuted, fontSize: 13 }, meta: { color: COLORS.textMuted, marginTop: 13, fontSize: 12 },
  exportRow: { marginTop: SPACING.md, gap: SPACING.sm }, exportStatus: { color: COLORS.textMuted, fontSize: 12 }, exportButton: { minHeight: 44, borderRadius: 11, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, exportButtonText: { color: COLORS.text, fontWeight: '800' }, disabled: { opacity: 0.5 }, promptCard: { marginTop: SPACING.lg, padding: SPACING.lg, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, promptHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: SPACING.sm }, sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' }, promptCount: { color: COLORS.textSubtle, fontSize: 11 }, promptScroll: { maxHeight: 240 }, prompt: { color: COLORS.text, lineHeight: 22, fontSize: 14, paddingBottom: 4 },
  copy: { minHeight: 44, marginTop: SPACING.md, borderRadius: 11, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, copyText: { color: COLORS.text, fontWeight: '800' }, backAction: { minHeight: 44, paddingHorizontal: 16, borderRadius: 11, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', gap: 7 }, backActionText: { color: COLORS.text, fontWeight: '800' }, backGlyph: { color: COLORS.text, fontSize: 27, lineHeight: 24 },
});
