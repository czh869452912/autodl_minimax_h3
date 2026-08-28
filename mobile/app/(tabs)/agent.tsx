import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react-native';

const adapter: ChatModelAdapter = {
  async *run({ messages }) {
    const endpoint = process.env.EXPO_PUBLIC_CHAT_ENDPOINT_URL;
    const latest = messages[messages.length - 1];
    const text = latest?.content?.filter((part) => part.type === 'text').map((part) => part.text).join('') ?? '';
    if (!endpoint) {
      yield { content: [{ type: 'text', text: `已收到：${text}\n\n请在设置中配置 EXPO_PUBLIC_CHAT_ENDPOINT_URL 以连接 H3 Agent。` }] };
      return;
    }
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) });
    if (!response.ok) throw new Error(`Agent 请求失败（${response.status}）`);
    const payload = await response.json() as { text?: string; message?: string };
    yield { content: [{ type: 'text', text: payload.text || payload.message || '服务端未返回文本。' }] };
  },
};

function Thread() {
  return <ThreadPrimitive.Root style={styles.thread}>
    <ThreadPrimitive.MessagesFlatList autoScroll contentContainerStyle={styles.messages} children={({ message }) => (
      <MessagePrimitive.Root style={styles.message}>
        <MessagePrimitive.Content />
      </MessagePrimitive.Root>
    )} />
    <ComposerPrimitive.Root style={styles.composer}>
      <ComposerPrimitive.Input placeholder="描述你想生成或修改的视频…" placeholderTextColor="#64748b" style={styles.input} />
      <ComposerPrimitive.Send style={styles.send}><Text style={styles.sendText}>发送</Text></ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  </ThreadPrimitive.Root>;
}

export default function AgentScreen() {
  const runtime = useLocalRuntime(adapter);
  return <AssistantRuntimeProvider runtime={runtime}><View style={styles.container}><Text style={styles.title}>Prompt 助手</Text><Text style={styles.body}>由 assistant-ui Native primitives 管理消息、输入和发送状态。</Text><Thread /></View></AssistantRuntimeProvider>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', padding: 24, paddingTop: 64 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' },
  body: { color: '#94a3b8', marginTop: 8, marginBottom: 12 },
  thread: { flex: 1 },
  messages: { paddingVertical: 12, gap: 10 },
  message: { padding: 12, borderRadius: 12, backgroundColor: '#0f172a', marginBottom: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingBottom: 12 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, color: '#e2e8f0', backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  send: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4f46e5' },
  sendText: { color: '#fff', fontWeight: '700' },
});
