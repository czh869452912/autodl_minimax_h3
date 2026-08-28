import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { openDatabaseSync } from 'expo-sqlite';
import { createTaskRepository } from '../../src/tasks/repository';
import type { TaskRecord } from '../../src/tasks/types';
import { syncTasks } from '../../src/tasks/background';

const taskStore = createTaskRepository(openDatabaseSync('autodl-h3.db'));

export default function TasksScreen() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const load = useCallback(async () => { setTasks(await taskStore.list()); try { await syncTasks(); } catch {} setTasks(await taskStore.list()); }, []);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 10000); return () => clearInterval(timer); }, [load]);
  const remove = async (id: string) => { await taskStore.remove(id); setTasks((items) => items.filter((item) => item.id !== id)); };
  return <View style={styles.container}><Text style={styles.title}>任务队列</Text><Text style={styles.subtitle}>每 10 秒自动同步进行中的 AutoDL 任务。</Text><FlatList data={tasks} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} ListEmptyComponent={<Text style={styles.empty}>暂无任务</Text>} renderItem={({ item }) => <View style={styles.card}><View style={styles.header}><Text style={styles.id}>{item.id}</Text><Text style={[styles.status, item.status === 'SUCCESS' && styles.success]}>{item.status}</Text></View><Text numberOfLines={3} style={styles.prompt}>{item.prompt}</Text><Text style={styles.meta}>{item.resolution} · {item.duration}s</Text><Pressable onPress={() => Alert.alert('移除任务', '仅移除本地记录，不会撤销服务端任务。', [{ text: '取消' }, { text: '移除', style: 'destructive', onPress: () => void remove(item.id) }])}><Text style={styles.remove}>移除记录</Text></Pressable></View>} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', padding: 24, paddingTop: 64 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#94a3b8', marginTop: 8 }, list: { paddingTop: 20, gap: 12, paddingBottom: 30 }, empty: { color: '#64748b', textAlign: 'center', marginTop: 64 }, card: { backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, borderRadius: 14, padding: 16 }, header: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, id: { color: '#818cf8', fontSize: 11, flex: 1 }, status: { color: '#fbbf24', fontSize: 11, fontWeight: '700' }, success: { color: '#34d399' }, prompt: { color: '#e2e8f0', marginTop: 10, lineHeight: 20 }, meta: { color: '#64748b', marginTop: 12, fontSize: 12 }, remove: { color: '#94a3b8', alignSelf: 'flex-end', marginTop: 12, fontSize: 12 },
});
