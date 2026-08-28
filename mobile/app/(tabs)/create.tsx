import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { openDatabaseSync } from 'expo-sqlite';
import { readSettings } from '../../src/settings/storage';
import { submitTask } from '../../src/tasks/api';
import { createTaskRepository } from '../../src/tasks/repository';

const taskStore = createTaskRepository(openDatabaseSync('autodl-h3.db'));

export default function CreateScreen() {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('5');
  const [resolution, setResolution] = useState('768p竖');
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async () => {
    if (!prompt.trim()) return Alert.alert('提示', '请输入视频 Prompt');
    setSubmitting(true);
    try { const settings = await readSettings(); if (!settings.token) throw new Error('请先在设置中保存 AutoDL Token'); const task = await submitTask(settings.token, { prompt: prompt.trim(), duration: Number(duration) || 5, resolution }); await taskStore.upsert(task); setPrompt(''); Alert.alert('提交成功', `任务 ${task.id} 已加入队列`); } catch (error) { Alert.alert('提交失败', error instanceof Error ? error.message : '未知错误'); } finally { setSubmitting(false); }
  };
  return <View style={styles.container}><Text style={styles.title}>AutoDL H3 视频生成</Text><Text style={styles.subtitle}>原生网络层提交任务，任务状态和媒体索引统一落在 SQLite。</Text><Text style={styles.label}>Generation Prompt</Text><TextInput multiline value={prompt} onChangeText={setPrompt} placeholder="描述你希望生成的画面、动作、镜头和声音…" placeholderTextColor="#64748b" style={[styles.input, styles.prompt]} /><View style={styles.row}><View style={styles.field}><Text style={styles.label}>时长（秒）</Text><TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" style={styles.input} /></View><View style={styles.field}><Text style={styles.label}>分辨率</Text><TextInput value={resolution} onChangeText={setResolution} style={styles.input} /></View></View><Pressable disabled={submitting} onPress={handleSubmit} style={({ pressed }) => [styles.button, pressed && styles.pressed, submitting && styles.disabled]}><Text style={styles.buttonText}>{submitting ? '提交中…' : '提交 AutoDL 任务'}</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', padding: 24, paddingTop: 64 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#94a3b8', marginTop: 8, marginBottom: 24 },
  label: { color: '#94a3b8', fontSize: 12, marginBottom: 8 },
  input: { backgroundColor: '#0f172a', color: '#e2e8f0', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', paddingHorizontal: 14, paddingVertical: 12 },
  prompt: { minHeight: 180, textAlignVertical: 'top', marginBottom: 18 },
  row: { flexDirection: 'row', gap: 12 }, field: { flex: 1 },
  button: { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 24 }, pressed: { opacity: 0.8 }, disabled: { opacity: 0.5 }, buttonText: { color: '#fff', fontWeight: '700' },
});
