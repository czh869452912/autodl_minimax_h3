import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { openDatabaseSync } from 'expo-sqlite';
import { openNativeVideo } from '../../src/native/media';
import { createTaskRepository } from '../../src/tasks/repository';
import type { TaskRecord } from '../../src/tasks/types';
import { VideoPlayer } from '../../src/media/VideoPlayer';
const store = createTaskRepository(openDatabaseSync('autodl-h3.db'));
export default function VideoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const [task, setTask] = useState<TaskRecord | null>(null);
  useEffect(() => { if (id) void store.list().then((items) => setTask(items.find((item) => item.id === id) || null)); }, [id]);
  if (!task) return <View style={styles.center}><ActivityIndicator color="#818cf8" /><Text style={styles.muted}>正在加载作品…</Text></View>;
  const source = task.localUri || task.videoUrl || '';
  return <ScrollView style={styles.container} contentContainerStyle={styles.content}><View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ 返回画廊</Text></Pressable><Text style={styles.title}>视频详情</Text></View><View style={styles.player}><VideoPlayer source={source} poster={task.thumbnailUrl} /></View><Text style={styles.meta}>{task.resolution} · {task.duration}s · {task.status}</Text><Text style={styles.prompt}>{task.prompt}</Text><View style={styles.actions}><Pressable style={styles.action} onPress={() => openNativeVideo(source)}><Text style={styles.actionText}>打开 Media3 播放器</Text></Pressable><Pressable style={styles.action} onPress={async () => { await Clipboard.setStringAsync(task.prompt); Alert.alert('已复制', 'Prompt 已复制到剪贴板'); }}><Text style={styles.actionText}>复制 Prompt</Text></Pressable></View></ScrollView>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#020617' }, content: { padding: 18, paddingTop: 56, paddingBottom: 40 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617' }, muted: { color: '#94a3b8', marginTop: 12 }, header: { flexDirection: 'row', alignItems: 'center', gap: 24, marginBottom: 18 }, back: { color: '#a5b4fc', fontSize: 15 }, title: { color: '#f8fafc', fontSize: 24, fontWeight: '700' }, player: { width: '100%', aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }, meta: { color: '#94a3b8', marginTop: 14 }, prompt: { color: '#e2e8f0', lineHeight: 22, marginTop: 14 }, actions: { flexDirection: 'row', gap: 10, marginTop: 20 }, action: { flex: 1, backgroundColor: '#312e81', borderRadius: 10, padding: 13, alignItems: 'center' }, actionText: { color: '#fff', fontWeight: '600', fontSize: 12 } });
