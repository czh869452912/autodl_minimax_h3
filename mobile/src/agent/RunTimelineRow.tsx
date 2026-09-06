import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { RUN_LABELS, toolActivity } from './assistantWorkspace';
import type { PromptRun } from './runState';

export function RunTimelineRow({ run, disabled, onRetry }: { run: PromptRun; disabled: boolean; onRetry: (id: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(run.status === 'failed' || run.status === 'interrupted');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (run.status === 'failed' || run.status === 'interrupted') setExpanded(true); }, [run.status]);
  useEffect(() => {
    if (run.status !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run.status]);
  const active = run.tools.find(tool => tool.status === 'running');
  const seconds = Math.max(0, Math.floor(((run.endedAt ?? now) - run.startedAt) / 1000));
  return <View style={{ padding: 12, marginVertical: 8, backgroundColor: '#f1f3f5', borderRadius: 12, gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`查看运行 ${run.id}`} onPress={() => setExpanded(value => !value)} style={{ flexDirection: 'row', gap: 8 }}>
      {run.status === 'running' ? <ActivityIndicator size="small" /> : null}
      <Text>{run.status === 'running' && active ? toolActivity(active.name) : RUN_LABELS[run.status]} · {seconds} 秒{run.retryOf ? ' · 重试' : ''} {expanded ? '⌄' : '›'}</Text>
    </Pressable>
    {expanded ? <View style={{ gap: 6 }}>
      <Text>{new Date(run.startedAt).toLocaleString('zh-CN')} · {run.tools.length} 个步骤</Text>
      {run.tools.map(tool => <View key={tool.id}>
        <Text>{tool.status === 'complete' ? '✓' : tool.status === 'failed' ? '×' : tool.status === 'cancelled' ? '–' : '…'} {toolActivity(tool.name)} · {Math.max(0, Math.floor(((tool.endedAt ?? now) - tool.startedAt) / 1000))} 秒</Text>
        {tool.summary ? <Text numberOfLines={5} selectable>{tool.summary}</Text> : null}
      </View>)}
    </View> : null}
    {run.error ? <Text accessibilityRole="alert">{run.error}</Text> : null}
    {run.status === 'interrupted' ? <Text>上次运行未完成，已保留内容。可重新生成这一轮。</Text> : null}
    {run.status !== 'running' && run.status !== 'completed' ? <Pressable accessibilityRole="button" accessibilityLabel={`重试运行 ${run.id}`} disabled={disabled || busy} onPress={async () => {
      if (busy || disabled) return;
      setBusy(true); setError('');
      try { await onRetry(run.id); } catch (reason) { setError(reason instanceof Error ? reason.message : '重试失败'); } finally { setBusy(false); }
    }}><Text style={{ color: disabled ? '#888' : '#315bc7' }}>{busy ? '正在重试…' : '重新生成这一轮'}</Text></Pressable> : null}
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
  </View>;
}
