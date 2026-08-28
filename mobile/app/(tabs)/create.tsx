import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { openDatabaseSync } from 'expo-sqlite';
import { readSettings } from '../../src/settings/storage';
import { submitTask } from '../../src/tasks/api';
import { createTaskRepository } from '../../src/tasks/repository';
import type { TaskMediaInput } from '../../src/tasks/types';

const taskStore = createTaskRepository(openDatabaseSync('autodl-h3.db'));
const resolutions = ['768p竖', '768p横', '1080p横', '2K横'];

async function pickMedia(kind: 'image' | 'audio', current: TaskMediaInput[]) {
  const result = await DocumentPicker.getDocumentAsync({ type: kind === 'image' ? 'image/*' : 'audio/*', multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return current;
  const limit = kind === 'image' ? 9 : 3;
  const selected = result.assets.slice(0, Math.max(0, limit - current.length));
  if (selected.some((asset) => (asset.size || 0) > 50 * 1024 * 1024)) throw new Error('单个参考素材不能超过 50MB');
  const picked = await Promise.all(selected.map(async (asset) => {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    return { dataUri: `data:${asset.mimeType || (kind === 'image' ? 'image/png' : 'audio/mpeg')};base64,${base64}`, name: asset.name, mime: asset.mimeType };
  }));
  return [...current, ...picked];
}

export default function CreateScreen() {
  const [prompt, setPrompt] = useState(''); const [duration, setDuration] = useState('5'); const [resolution, setResolution] = useState(resolutions[0]); const [seed, setSeed] = useState('');
  const [images, setImages] = useState<TaskMediaInput[]>([]); const [audios, setAudios] = useState<TaskMediaInput[]>([]); const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async () => {
    if (!prompt.trim()) return Alert.alert('提示', '请输入视频 Prompt'); setSubmitting(true);
    try { const settings = await readSettings(); if (!settings.token) throw new Error('请先在设置中保存 AutoDL Token'); const task = await submitTask(settings.token, { prompt: prompt.trim(), duration: Number(duration) || 5, resolution, seed, images, audios }); await taskStore.upsert(task); setPrompt(''); Alert.alert('提交成功', `任务 ${task.id} 已加入队列`); }
    catch (error) { Alert.alert('提交失败', error instanceof Error ? error.message : '未知错误'); } finally { setSubmitting(false); }
  };
  return <ScrollView style={styles.container} contentContainerStyle={styles.content}><Text style={styles.title}>AutoDL H3 视频生成</Text><Text style={styles.subtitle}>原生任务提交，支持多图、多音频、种子和分辨率。</Text><Text style={styles.label}>Generation Prompt</Text><TextInput multiline value={prompt} onChangeText={setPrompt} placeholder="描述主体、动作、镜头、光影与声音…" placeholderTextColor="#64748b" style={[styles.input, styles.prompt]} />
    <Text style={styles.label}>分辨率</Text><View style={styles.chips}>{resolutions.map((item) => <Pressable key={item} onPress={() => setResolution(item)} style={[styles.chip, resolution === item && styles.chipSelected]}><Text style={styles.chipText}>{item}</Text></Pressable>)}</View>
    <View style={styles.row}><View style={styles.field}><Text style={styles.label}>时长（秒）</Text><TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" style={styles.input} /></View><View style={styles.field}><Text style={styles.label}>Seed（可选）</Text><TextInput value={seed} onChangeText={setSeed} keyboardType="number-pad" placeholder="随机" placeholderTextColor="#64748b" style={styles.input} /></View></View>
    <View style={styles.mediaRow}><Pressable onPress={async () => { try { setImages(await pickMedia('image', images)); } catch (error) { Alert.alert('素材不可用', error instanceof Error ? error.message : '读取素材失败'); } }} style={styles.mediaButton}><Text style={styles.mediaText}>添加参考图 ({images.length}/9)</Text></Pressable><Pressable onPress={async () => { try { setAudios(await pickMedia('audio', audios)); } catch (error) { Alert.alert('素材不可用', error instanceof Error ? error.message : '读取素材失败'); } }} style={styles.mediaButton}><Text style={styles.mediaText}>添加参考音频 ({audios.length}/3)</Text></Pressable></View>
    <Pressable disabled={submitting} onPress={handleSubmit} style={({ pressed }) => [styles.button, pressed && styles.pressed, submitting && styles.disabled]}><Text style={styles.buttonText}>{submitting ? '提交中…' : '提交 AutoDL 任务'}</Text></Pressable>
  </ScrollView>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#020617' }, content: { padding: 24, paddingTop: 64, paddingBottom: 40 }, title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' }, subtitle: { color: '#94a3b8', marginTop: 8, marginBottom: 24 }, label: { color: '#94a3b8', fontSize: 12, marginBottom: 8 }, input: { backgroundColor: '#0f172a', color: '#e2e8f0', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', paddingHorizontal: 14, paddingVertical: 12 }, prompt: { minHeight: 180, textAlignVertical: 'top', marginBottom: 18 }, row: { flexDirection: 'row', gap: 12 }, field: { flex: 1 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }, chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b' }, chipSelected: { borderColor: '#6366f1', backgroundColor: '#312e81' }, chipText: { color: '#e2e8f0' }, mediaRow: { flexDirection: 'row', gap: 10, marginTop: 20 }, mediaButton: { flex: 1, backgroundColor: '#0f172a', borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: '#1e293b' }, mediaText: { color: '#c7d2fe', fontSize: 12 }, button: { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 24 }, pressed: { opacity: 0.8 }, disabled: { opacity: 0.5 }, buttonText: { color: '#fff', fontWeight: '700' }, });
