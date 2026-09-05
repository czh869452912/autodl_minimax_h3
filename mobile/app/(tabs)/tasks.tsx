import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppIcon } from '../../src/ui/icons';
import { COLORS, SPACING } from '../../src/ui/theme';
import { taskCommandService, taskStore, listActiveTaskIds } from '../../src/tasks/taskServices';
import { useTaskListSession } from '../../src/tasks/useTaskListSession';
import { TaskCardRow } from '../../src/tasks/TaskCardRow';
import { taskProjectionEvents } from '../../src/tasks/taskProjectionEvents';
import type { TaskCard } from '../../src/tasks/taskCard';
import { readSettings } from '../../src/settings/storage';
import { getTaskMonitorStatus, startTaskMonitor, stopTaskMonitor } from '../../src/native/taskMonitor';

export default function TasksScreen() {
  const { session, snapshot } = useTaskListSession();
  const [monitoring, setMonitoring] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const busy = useRef(new Set<string>());
  useEffect(() => { let active = true; void getTaskMonitorStatus().then(value => { if (active) setMonitoring(value.running); }).catch(() => undefined); return () => { active = false; }; }, []);
  const refresh = useCallback(() => {
    void session.refresh('manual').catch(error => Alert.alert('刷新失败', error instanceof Error ? error.message : String(error)));
    void taskCommandService.requestRefresh({ maintenance: 'force-next-slice' }).catch(error => Alert.alert('后台刷新请求失败', error instanceof Error ? error.message : String(error)));
  }, [session]);
  const action = useCallback(async (item: TaskCard, exportRequested: boolean) => {
    if (busy.current.has(item.id)) return;
    busy.current.add(item.id); setBusyIds(new Set(busy.current));
    try {
      if (exportRequested) { const settings = await readSettings(); await taskCommandService.requestExport(item.id, { keepPrivateCopy: settings.keepPrivateCopy }); }
      else await taskCommandService.requestDownload(item.id);
    } catch (error) { Alert.alert(exportRequested ? '保存失败' : '下载失败', error instanceof Error ? error.message : String(error)); }
    finally { busy.current.delete(item.id); setBusyIds(new Set(busy.current)); }
  }, []);
  const download = useCallback((item: TaskCard) => { void action(item, false); }, [action]);
  const exportTask = useCallback((item: TaskCard) => { void action(item, true); }, [action]);
  const remove = useCallback((id: string) => { void taskStore.remove(id).then(() => taskProjectionEvents.invalidate()).catch(error => Alert.alert('移除失败', String(error))); }, []);
  const open = useCallback((id: string) => router.push({ pathname: '/video/[id]', params: { id } }), []);
  const renderItem = useCallback(({ item }: { item: TaskCard }) => <TaskCardRow item={item} busy={busyIds.has(item.id)} onDownload={download} onExport={exportTask} onRemove={remove} onOpen={open} />, [busyIds, download, exportTask, remove, open]);
  const toggleMonitoring = async () => {
    try {
      if (monitoring) { await stopTaskMonitor(); setMonitoring(false); return; }
      const result = await startTaskMonitor(await listActiveTaskIds());
      if (result.started) setMonitoring(true);
      else Alert.alert('无法开启持续监控', result.reason === 'no-active-tasks' ? '当前没有可监控的任务。' : '请检查通知权限或稍后重试。');
    } catch (error) { Alert.alert('开启失败', String(error)); }
  };
  const updated = snapshot.read.lastCheckedAt == null ? '' : new Date(snapshot.read.lastCheckedAt).toTimeString().slice(0, 8);
  return <View style={styles.container}>
    <View style={styles.heading}><View><Text style={styles.title}>任务队列</Text><Text style={styles.subtitle}>任务状态、下载进度和本地媒体统一管理。</Text>
      <Text style={styles.syncStatus}>{snapshot.read.pending ? '正在刷新…' : updated ? '已更新 ' + updated : ''}</Text>
      {snapshot.work.phase === 'running' ? <Text style={styles.syncStatus}>后台处理中…</Text> : null}
      {snapshot.work.phase === 'backoff' ? <Text style={styles.syncStatus}>后台处理将在稍后重试</Text> : null}
      {snapshot.phase === 'stale' ? <Text style={styles.syncError}>{'状态可能已过期：' + snapshot.read.error}</Text> : null}
    </View><View style={styles.headingActions}>
      <Pressable accessibilityRole="button" accessibilityLabel={monitoring ? '停止持续监控' : '开启持续监控'} onPress={() => void toggleMonitoring()} style={styles.refresh}><AppIcon name="notifications" size={20} color={COLORS.textMuted} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="刷新任务" accessibilityState={{ busy: snapshot.read.pending }} onPress={refresh} style={styles.refresh}>{snapshot.read.pending ? <ActivityIndicator size="small" /> : <AppIcon name="refresh" size={20} color={COLORS.textMuted} />}</Pressable>
    </View></View>
    <FlatList data={snapshot.items} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={7} updateCellsBatchingPeriod={50} removeClippedSubviews
      keyExtractor={item => item.id} contentContainerStyle={styles.list} refreshing={snapshot.read.pending} onRefresh={refresh}
      onEndReached={() => { void session.loadMore().catch(error => Alert.alert('加载失败', String(error))); }} onEndReachedThreshold={0.6}
      ListEmptyComponent={<Text style={styles.empty}>{snapshot.read.pending ? '正在读取任务…' : '暂无任务'}</Text>} renderItem={renderItem} />
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.xl }, heading: { position: 'relative', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingRight: 100 }, headingActions: { position: 'absolute', right: 0, top: 0, flexDirection: 'row', gap: 8, flexShrink: 0 }, title: { color: COLORS.text, fontSize: 29, fontWeight: '800' }, subtitle: { color: COLORS.textMuted, marginTop: 7, lineHeight: 20 }, syncStatus: { color: COLORS.primaryActive, marginTop: 5, fontSize: 11 }, syncError: { color: COLORS.danger, marginTop: 8, fontSize: 11 }, refresh: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, refreshing: { borderColor: COLORS.primaryActive, opacity: 0.8 }, monitoring: { borderColor: COLORS.primaryActive }, list: { gap: SPACING.md, paddingTop: SPACING.xl, paddingBottom: 130 }, empty: { color: COLORS.textSubtle, textAlign: 'center', marginTop: 64 }, card: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: 16, padding: SPACING.lg }, header: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md }, id: { color: COLORS.primaryActive, fontSize: 11, flex: 1, fontFamily: 'monospace' }, status: { color: '#fbbf24', fontSize: 11, fontWeight: '800' }, running: { color: COLORS.primaryActive }, success: { color: COLORS.success }, failure: { color: COLORS.danger }, prompt: { color: COLORS.text, marginTop: 11, lineHeight: 20 }, meta: { color: COLORS.textSubtle, marginTop: 11, fontSize: 12 }, timing: { gap: 4, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border }, timingText: { color: COLORS.textMuted, fontSize: 12, fontFamily: 'monospace' }, downloadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: COLORS.border }, downloadText: { color: COLORS.textMuted, fontSize: 12, flex: 1 }, action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.primarySoft }, actionText: { color: COLORS.primaryActive, fontSize: 12, fontWeight: '700' }, remove: { alignSelf: 'flex-end', marginTop: 12 }, removeText: { color: COLORS.textSubtle, fontSize: 12 }, disabled: { opacity: 0.5 } });
