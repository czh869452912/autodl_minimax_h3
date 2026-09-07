import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { RUN_LABELS, toolActivity } from './assistantWorkspace';
import type { PromptRun } from './runState';
import { COLORS } from '../ui/theme';
import { AppIcon } from '../ui/icons';
import type { ProcessEntry } from './runTimeline';

export function RunTimelineRow({ run, entries = [], disabled, onRetry, onInspect }: { run: PromptRun; entries?: ProcessEntry[]; disabled: boolean; onRetry: (id: string) => Promise<void>; onInspect?: () => void }) {
  const [expanded, setExpanded] = useState(run.status === 'running' || run.status === 'failed' || run.status === 'interrupted');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (run.status === 'running' || run.status === 'failed' || run.status === 'interrupted') setExpanded(true); }, [run.status]);
  useEffect(() => {
    if (run.status !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run.status]);
  const active = run.tools.find(tool => tool.status === 'running');
  const seconds = Math.max(0, Math.floor(((run.endedAt ?? now) - run.startedAt) / 1000));
  return <View style={styles.container}>
    <Pressable accessibilityRole="button" accessibilityLabel={`查看运行 ${run.id}`} accessibilityState={{ expanded }} onPress={() => { if (!expanded) onInspect?.(); setExpanded(value => !value); }} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
      {run.status === 'running' ? <ActivityIndicator size="small" color={COLORS.primary} /> : <AppIcon name={run.status === 'failed' || run.status === 'interrupted' ? 'info' : 'list_alt'} size={18} color={COLORS.textMuted} />}
      <Text style={styles.label}>{run.status === 'running' && active ? toolActivity(active.name) : `执行过程 · ${RUN_LABELS[run.status]}`}{run.retryOf ? ' · 重试' : ''}</Text>
      <Text style={styles.meta}>{entries.length} 项 · {seconds} 秒</Text>
      <AppIcon name={expanded ? 'expand_less' : 'expand_more'} size={18} color={COLORS.textMuted} />
    </Pressable>
    {expanded ? <View style={styles.details}>
      {entries.map(entry => <ProcessItem key={entry.id} entry={entry} now={now} onInspect={onInspect} />)}
      {!entries.length && run.status === 'running' ? <Text style={styles.meta}>正在准备回复…</Text> : null}
    </View> : null}
    {run.error ? <Text accessibilityRole="alert">{run.error}</Text> : null}
    {run.status === 'interrupted' ? <Text>上次运行未完成，已保留内容。可重新生成这一轮。</Text> : null}
    {['failed', 'cancelled', 'interrupted'].includes(run.status) ? <Pressable accessibilityRole="button" accessibilityLabel={`重试运行 ${run.id}`} accessibilityState={{ disabled: disabled || busy, busy }} style={{ minHeight: 48, justifyContent: 'center' }} disabled={disabled || busy} onPress={async () => {
      if (busy || disabled) return;
      setBusy(true); setError('');
      try { await onRetry(run.id); } catch (reason) { setError(reason instanceof Error ? reason.message : '重试失败'); } finally { setBusy(false); }
    }}><Text style={{ color: disabled ? COLORS.textSubtle : COLORS.primaryActive }}>{busy ? '正在重试…' : '重新生成这一轮'}</Text></Pressable> : null}
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
  </View>;
}

function toolTarget(args?: string): string {
  if (!args) return '';
  try {
    const value = JSON.parse(args);
    return [value.file_path, value.path, value.command, value.pattern, value.query].find(item => typeof item === 'string') ?? '';
  } catch { return ''; }
}

function ProcessItem({ entry, now, onInspect }: { entry: ProcessEntry; now: number; onInspect?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const tool = entry.kind === 'tool' ? entry.tool : undefined;
  const title = tool ? toolActivity(tool.name) : entry.kind === 'reasoning' ? '思考' : '中间回复';
  const text = tool ? tool.output ?? tool.summary ?? '' : entry.kind !== 'tool' ? entry.text : '';
  const status = tool ? ({ complete: '完成', running: '执行中', failed: '失败', cancelled: '已停止' } as const)[tool.status] : '';
  const target = toolTarget(tool?.arguments);
  return <View style={styles.step}>
    <Pressable testID={`process-item-${entry.id}`} accessibilityRole="button" accessibilityLabel={`${title}${target ? `，${target}` : ''}${status ? `，${status}` : ''}`} accessibilityState={{ expanded }} onPress={() => { if (!expanded) onInspect?.(); setExpanded(value => !value); }} style={({ pressed }) => [styles.itemToggle, pressed && styles.pressed]}>
      {tool?.status === 'running' ? <ActivityIndicator size="small" color={COLORS.primary} /> : <AppIcon name={tool ? tool.status === 'failed' ? 'info' : 'list_alt' : entry.kind === 'reasoning' ? 'auto_awesome' : 'smart_toy'} size={16} color={tool?.status === 'failed' ? COLORS.danger : COLORS.textMuted} />}
      <Text style={styles.itemLabel}>{title}</Text>
      {tool ? <Text style={[styles.meta, tool.status === 'failed' && styles.failure]}>{status} · {Math.max(0, Math.floor(((tool.endedAt ?? now) - tool.startedAt) / 1000))} 秒</Text> : null}
      <AppIcon name={expanded ? 'expand_less' : 'expand_more'} size={16} color={COLORS.textMuted} />
    </Pressable>
    {target ? <Text style={styles.target} numberOfLines={expanded ? undefined : 1} selectable={expanded}>{target}</Text> : null}
    {expanded && tool?.arguments ? <View style={styles.payload}><Text style={styles.meta}>输入 · {tool.name}</Text><PagedText text={tool.arguments} onInspect={onInspect} /></View> : null}
    {text ? <View style={expanded ? styles.payload : styles.preview}>
      {expanded && tool ? <Text style={styles.meta}>输出</Text> : null}
      {expanded ? <PagedText text={text} onInspect={onInspect} /> : <Text numberOfLines={2} style={tool ? styles.code : styles.stepText}>{text.slice(0, 240)}</Text>}
    </View> : null}
  </View>;
}

function PagedText({ text, onInspect }: { text: string; onInspect?: () => void }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(text.length / 4000));
  const current = Math.min(page, pages - 1);
  return <View style={{ gap: 8 }}>
    <Text selectable style={styles.code}>{text.slice(current * 4000, (current + 1) * 4000)}</Text>
    {pages > 1 ? <View style={styles.itemToggle}>
      <Pressable accessibilityRole="button" accessibilityLabel="上一段" disabled={current === 0} onPress={() => { onInspect?.(); setPage(current - 1); }} style={styles.toggle}><AppIcon name="expand_less" size={20} /></Pressable>
      <Text style={styles.meta}>{current + 1} / {pages}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="下一段" disabled={current === pages - 1} onPress={() => { onInspect?.(); setPage(current + 1); }} style={styles.toggle}><AppIcon name="expand_more" size={20} /></Pressable>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { marginVertical: 4, gap: 6 },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 8 },
  pressed: { backgroundColor: COLORS.surfaceRaised },
  label: { flex: 1, fontSize: 13, lineHeight: 19, color: COLORS.textMuted, fontWeight: '600' },
  meta: { fontSize: 12, lineHeight: 18, color: COLORS.textSubtle, flexShrink: 1 },
  details: { marginLeft: 16, paddingLeft: 16, paddingBottom: 8, borderLeftWidth: 1, borderLeftColor: COLORS.border, gap: 10 },
  step: { gap: 4, paddingBottom: 8 },
  itemToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 6 },
  itemLabel: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: '600' },
  target: { fontSize: 12, lineHeight: 18, color: COLORS.primary, marginLeft: 22 },
  preview: { marginLeft: 22 },
  payload: { paddingVertical: 8, gap: 5 },
  code: { fontSize: 12, lineHeight: 19, color: COLORS.textMuted },
  failure: { color: COLORS.danger },
  stepText: { fontSize: 13, lineHeight: 20, color: COLORS.text },
});
