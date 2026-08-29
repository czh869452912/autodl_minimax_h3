import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { openDatabaseSync } from 'expo-sqlite';
import { createTaskRepository } from '../../src/tasks/repository';
import type { TaskRecord } from '../../src/tasks/types';
import { mediaSource, mediaStatusLabel } from '../../src/gallery/presentation';
import { VideoPlayer } from '../../src/media/VideoPlayer';
import { AppIcon } from '../../src/ui/icons';
import { COLORS, SPACING } from '../../src/ui/theme';

const store = createTaskRepository(openDatabaseSync('autodl-h3.db'));

export default function VideoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!id) { setLoaded(true); return; }
    void store.list().then((items) => setTask(items.find((item) => item.id === id) || null)).finally(() => setLoaded(true));
  }, [id]);

  if (!loaded) return <View style={styles.center}><ActivityIndicator color={COLORS.primaryActive} /><Text style={styles.muted}>正在加载作品…</Text></View>;
  if (!task) return <View style={styles.center}><Text style={styles.title}>作品不存在或已删除</Text><Pressable accessibilityRole="button" accessibilityLabel="返回画廊" onPress={() => router.back()} style={styles.backAction}><Text style={styles.backGlyph}>‹</Text><Text style={styles.backActionText}>返回画廊</Text></Pressable></View>;

  const source = mediaSource(task);
  const copyPrompt = async () => {
    if (!task.prompt.trim()) { Alert.alert('无法复制', '当前作品没有 Prompt'); return; }
    try {
      await Clipboard.setStringAsync(task.prompt);
      Alert.alert('已复制', 'Prompt 已复制到剪贴板');
    } catch {
      Alert.alert('复制失败', '无法写入剪贴板，请稍后重试');
    }
  };

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回画廊" onPress={() => router.back()} hitSlop={10} style={styles.back}><Text style={styles.backGlyph}>‹</Text><Text style={styles.backText}>返回画廊</Text></Pressable><Text style={styles.title}>视频详情</Text></View>
    <View style={styles.player}>{source ? <VideoPlayer source={source} poster={task.thumbnailUrl} /> : <View accessibilityLabel="视频源不可用" style={styles.sourceEmpty}><AppIcon name="movie_filter" size={30} color={COLORS.textSubtle} /><Text style={styles.sourceEmptyText}>视频源不可用</Text></View>}</View>
    <Text style={styles.meta}>{task.resolution} · {task.duration}s · {task.status} · {task.downloadState === 'DOWNLOADED' ? '已下载' : mediaStatusLabel(task.localUri ? 'downloaded' : task.downloadState === 'DOWNLOAD_FAILED' ? 'failed' : 'downloading')}</Text>
    <View style={styles.promptCard}><View style={styles.promptHeader}><Text style={styles.sectionTitle}>Prompt</Text><Text style={styles.promptCount}>{task.prompt.length.toLocaleString()} 字符</Text></View><ScrollView accessibilityLabel="滚动 Prompt" nestedScrollEnabled style={styles.promptScroll}><Text selectable style={styles.prompt}>{task.prompt || '暂无 Prompt'}</Text></ScrollView><Pressable accessibilityRole="button" accessibilityLabel="复制 Prompt" onPress={() => void copyPrompt()} style={styles.copy}><AppIcon name="content_copy" size={18} color={COLORS.text} /><Text style={styles.copyText}>复制 Prompt</Text></Pressable></View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background }, container: { flex: 1, backgroundColor: COLORS.background }, content: { padding: SPACING.lg, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: COLORS.background, padding: SPACING.xl }, muted: { color: COLORS.textMuted },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, marginBottom: SPACING.lg }, back: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5 }, backText: { color: COLORS.primaryActive, fontSize: 14, fontWeight: '700' }, title: { color: COLORS.text, fontSize: 24, fontWeight: '800' },
  player: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }, sourceEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.surface }, sourceEmptyText: { color: COLORS.textMuted, fontSize: 13 }, meta: { color: COLORS.textMuted, marginTop: 13, fontSize: 12 },
  promptCard: { marginTop: SPACING.lg, padding: SPACING.lg, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, promptHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: SPACING.sm }, sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' }, promptCount: { color: COLORS.textSubtle, fontSize: 11 }, promptScroll: { maxHeight: 240 }, prompt: { color: COLORS.text, lineHeight: 22, fontSize: 14, paddingBottom: 4 },
  copy: { minHeight: 44, marginTop: SPACING.md, borderRadius: 11, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, copyText: { color: COLORS.text, fontWeight: '800' }, backAction: { minHeight: 44, paddingHorizontal: 16, borderRadius: 11, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', gap: 7 }, backActionText: { color: COLORS.text, fontWeight: '800' }, backGlyph: { color: COLORS.text, fontSize: 27, lineHeight: 24 },
});
