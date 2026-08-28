import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useLocalRuntime } from '@assistant-ui/react-native';
import { useComposerAddAttachment } from '@assistant-ui/core/react';
import { openDatabaseSync } from 'expo-sqlite';
import { adapter, createHistoryAdapter } from '../../src/agent/runtime';

const history = createHistoryAdapter(openDatabaseSync('autodl-h3.db'));
function Thread() {
  const { addAttachment } = useComposerAddAttachment();
  const pick = async () => { const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'audio/*'], copyToCacheDirectory: true }); if (result.canceled) return; const file = result.assets[0]; const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 }); const mime = file.mimeType || 'application/octet-stream'; await addAttachment({ id: `attachment-${Date.now()}`, name: file.name, type: mime.startsWith('image/') ? 'image' : 'file', contentType: mime, content: mime.startsWith('image/') ? [{ type: 'image', image: `data:${mime};base64,${base64}`, filename: file.name }] : [{ type: 'file', filename: file.name, data: base64, mimeType: mime }] }); };
  return <ThreadPrimitive.Root style={styles.thread}><ThreadPrimitive.MessagesFlatList autoScroll contentContainerStyle={styles.messages} children={({ message }) => <MessagePrimitive.Root style={styles.message}><MessagePrimitive.Content /></MessagePrimitive.Root>} /><ComposerPrimitive.Root style={styles.composer}><Pressable onPress={() => void pick()} style={styles.attach}><Text style={styles.sendText}>＋</Text></Pressable><ComposerPrimitive.Input placeholder="描述你想生成或修改的视频…" placeholderTextColor="#64748b" style={styles.input} /><ComposerPrimitive.Send style={styles.send}><Text style={styles.sendText}>发送</Text></ComposerPrimitive.Send></ComposerPrimitive.Root></ThreadPrimitive.Root>;
}
export default function AgentScreen() { const runtime = useLocalRuntime(adapter, { adapters: { history } }); return <AssistantRuntimeProvider runtime={runtime}><View style={styles.container}><Text style={styles.title}>Prompt 助手</Text><Text style={styles.body}>assistant-ui 管理交互、流式输出和 SQLite 持久化会话。</Text><Thread /></View></AssistantRuntimeProvider>; }
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#020617', padding: 24, paddingTop: 64 }, title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' }, body: { color: '#94a3b8', marginTop: 8, marginBottom: 12 }, thread: { flex: 1 }, messages: { paddingVertical: 12, gap: 10 }, message: { padding: 12, borderRadius: 12, backgroundColor: '#0f172a', marginBottom: 8 }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingBottom: 12 }, input: { flex: 1, minHeight: 44, maxHeight: 120, color: '#e2e8f0', backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }, attach: { minHeight: 44, width: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b' }, send: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4f46e5' }, sendText: { color: '#fff', fontWeight: '700' } });
