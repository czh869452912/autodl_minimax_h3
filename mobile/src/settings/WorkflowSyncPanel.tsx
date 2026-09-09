import { COLORS } from '../ui/theme';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createAppWorkflowCatalog } from '../workflows/registry/builtin';
import { loadRemoteSyncState, syncOfficialWorkflows } from '../workflows/registry/remoteApp';
import { workflowCatalogEvents } from '../workflows/registry/catalogEvents';
import type { RemoteSyncResult } from '../workflows/registry/remoteSync';
import type { RegistryRecord } from '../workflows/registry/types';
export function WorkflowSyncPanel() {
  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [result, setResult] = useState<RemoteSyncResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const refresh = async () => { try { const next = await createAppWorkflowCatalog().listActive(); if (mounted) setRecords(next); } catch { if (mounted) setError('无法读取已安装工作流'); } };
    void refresh();
    void loadRemoteSyncState().then(state => { if (mounted) setResult(state.result); }).catch(() => { if (mounted) setError('无法读取同步状态'); });
    const unsubscribe = workflowCatalogEvents.subscribe(() => { void refresh(); });
    return () => { mounted = false; unsubscribe(); };
  }, []);
  const sync = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { setResult(await syncOfficialWorkflows()); } catch { setError('同步失败，已安装工作流仍可使用'); } finally { setBusy(false); }
  };
  return <View style={styles.card}>
    <Text style={styles.title}>工作流</Text>
    <Text style={styles.note}>仅点击时从官方仓库同步。已安装版本可离线使用，现有任务保持原版本。</Text>
    {records.map(record => <Text key={record.workflowId} style={styles.row}>{record.workflowId} · {record.version} · {record.source === 'remote' ? '官方同步' : '内置/本地'}</Text>)}
    {records.length === 0 && <Text style={styles.note}>暂无已激活工作流</Text>}
    <Pressable testID="workflow-sync-button" accessibilityRole="button" disabled={busy} onPress={sync} style={[styles.button, busy && { opacity: 0.5 }]}><Text style={styles.buttonText}>{busy ? '同步中…' : '同步工作流'}</Text></Pressable>
    {result && <Text accessibilityLiveRegion="polite" style={styles.note}>{result.status === 'success' ? '同步完成' : result.status === 'partial' ? '部分同步完成' : '同步失败'} · {new Date(result.at).toLocaleString()} · 新增 {result.installed}，跳过 {result.skipped}{result.errors.length ? `\n${result.errors.slice(0, 3).join('\n')}` : ''}</Text>}
    {!!error && <Text style={styles.note}>{error}</Text>}
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 16, marginVertical: 12, borderRadius: 16, backgroundColor: COLORS.surface, gap: 10 }, title: { color: COLORS.text, fontSize: 18, fontWeight: '600' }, note: { color: COLORS.textMuted, fontSize: 13, lineHeight: 20 }, row: { color: COLORS.text, fontSize: 13 }, button: { backgroundColor: COLORS.primary, borderRadius: 10, padding: 12, alignItems: 'center' }, buttonText: { color: COLORS.onPrimary, fontWeight: '600' } });
