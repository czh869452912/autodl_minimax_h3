import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppIcon } from '../../src/ui/icons';
import { ListAction, ListEmptyState, ListFilters, listUI } from '../../src/ui/ListPageUI';
import { COLORS, SPACING } from '../../src/ui/theme';
import { getTaskServices } from '../../src/tasks/taskServices';
import { useTaskListSession } from '../../src/tasks/useTaskListSession';
import { TaskCardRow } from '../../src/tasks/TaskCardRow';
import { taskProjectionEvents } from '../../src/tasks/taskProjectionEvents';
import type { TaskCard } from '../../src/tasks/taskCard';
import { readSettings } from '../../src/settings/storage';
import { getTaskMonitorStatus, startTaskMonitor, stopTaskMonitor } from '../../src/native/taskMonitor';
import { useTaskMonitorStatus } from '../../src/native/useTaskMonitorStatus';
import { backgroundRegistration } from '../../src/tasks/background';

export default function TasksScreen() {
  const [filter, setFilter] = useState<'all' | 'active' | 'failed'>('all');
  const { session, snapshot } = useTaskListSession(undefined, filter);
  const [pageBusy, setPageBusy] = useState(false);
  const [pageError, setPageError] = useState('');
  const [maintenanceError, setMaintenanceError] = useState('');
  const monitorLock = useRef(false);
  const [monitorBusy, setMonitorBusy] = useState(false);
  const { status: monitor, setStatus: setMonitor } = useTaskMonitorStatus();
  const monitoring = monitor.running;
  const background = useSyncExternalStore(backgroundRegistration.subscribe, backgroundRegistration.getSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const refreshLock = useRef(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const busy = useRef(new Set<string>());
  const refresh = useCallback(() => {
    if (refreshLock.current) return;
    refreshLock.current = true; setRefreshing(true);
    void session.refresh('manual').catch(error => Alert.alert('刷新失败', error instanceof Error ? error.message : String(error))).finally(() => { refreshLock.current = false; setRefreshing(false); });
    void getTaskServices().taskCommandService.requestRefresh({ maintenance: 'force-next-slice' }).then(() => setMaintenanceError('')).catch(() => setMaintenanceError('后台维护请求失败，可稍后刷新重试；当前列表仍可查看'));
  }, [session]);
  const action = useCallback(async (item: TaskCard, exportRequested: boolean) => {
    if (busy.current.has(item.id)) return;
    busy.current.add(item.id); setBusyIds(new Set(busy.current));
    try {
      if (exportRequested) { const settings = await readSettings(); await getTaskServices().taskCommandService.requestExport(item.id, { keepPrivateCopy: settings.keepPrivateCopy }); }
      else await getTaskServices().taskCommandService.requestDownload(item.id);
    } catch (error) { Alert.alert(exportRequested ? '保存失败' : '下载失败', error instanceof Error ? error.message : String(error)); }
    finally { busy.current.delete(item.id); setBusyIds(new Set(busy.current)); }
  }, []);
  const download = useCallback((item: TaskCard) => { void action(item, false); }, [action]);
  const exportTask = useCallback((item: TaskCard) => { void action(item, true); }, [action]);
  const remove = useCallback((id: string) => { void getTaskServices().taskStore.remove(id).then(() => taskProjectionEvents.invalidate()).catch(error => Alert.alert('移除失败', String(error))); }, []);
  const open = useCallback((id: string) => router.push({ pathname: '/video/[id]', params: { id } }), []);
  const renderItem = useCallback(({ item }: { item: TaskCard }) => <TaskCardRow item={item} busy={busyIds.has(item.id)} onDownload={download} onExport={exportTask} onRemove={remove} onOpen={open} onCancel={id => { void getTaskServices().taskCommandService.requestCancel(id).catch(error => Alert.alert('无法取消', error.message)); }} onCancelMedia={(id, kind) => { void getTaskServices().taskCommandService.requestCancelMedia(id, kind).catch(error => Alert.alert('无法取消', error.message)); }} />, [busyIds, download, exportTask, remove, open]);
  const toggleMonitoring = async () => {
    if (monitorLock.current) return;
    monitorLock.current = true; setMonitorBusy(true);
    try {
      const current = await getTaskMonitorStatus();
      if (current.running) { await stopTaskMonitor(); setMonitor(await getTaskMonitorStatus()); return; }
      const result = await startTaskMonitor(await getTaskServices().listActiveTaskIds());
      setMonitor(await getTaskMonitorStatus());
      if (result.started && !result.notificationsEnabled) Alert.alert('持续监控已开启', result.permissionRequestFailed ? '通知权限请求未完成，监控仍会运行；可到系统设置开启通知以接收完成提醒。' : '通知权限未开启，监控仍会运行，但无法显示普通完成提醒。');
      else if (!result.started) Alert.alert('无法开启持续监控', result.reason === 'no-active-tasks' ? '当前没有可监控的任务。' : '系统未能启动持续监控，请保持应用在前台后重试。');
    } catch (error) { Alert.alert('开启失败', String(error)); } finally { monitorLock.current = false; setMonitorBusy(false); }
  };
  const updated = snapshot.read.lastCheckedAt == null ? '' : new Date(snapshot.read.lastCheckedAt).toTimeString().slice(0, 5);
  return <View style={styles.container}>
    <View style={styles.heading}>
      <Text style={styles.title}>任务队列</Text>
      <View style={styles.headingActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={monitoring ? '停止持续监控' : '开启持续监控'} disabled={monitorBusy} accessibilityState={{ checked: monitoring, busy: monitorBusy }} onPress={() => void toggleMonitoring()} style={({ pressed }) => [styles.refresh, monitoring && styles.monitoring, pressed && listUI.pressed, monitorBusy && listUI.disabled]}><AppIcon name={monitoring ? 'notifications_active' : 'notifications'} size={20} color={monitoring ? COLORS.primaryActive : COLORS.textMuted} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="刷新任务" accessibilityState={{ busy: refreshing }} onPress={refresh} style={({ pressed }) => [styles.refresh, pressed && listUI.pressed]}>{refreshing ? <ActivityIndicator size="small" color={COLORS.primaryActive} /> : <AppIcon name="refresh" size={20} color={COLORS.textMuted} />}</Pressable>
      </View>
    </View>
    <Text style={styles.subtitle}>任务状态、下载进度和本地媒体统一管理。</Text>
    {refreshing || snapshot.activity.activeTaskCount > 0 || updated ? <Text style={styles.syncStatus}>{refreshing ? '正在刷新…' : snapshot.activity.activeTaskCount > 0 ? '正在自动同步任务' : '已检查 ' + updated}</Text> : null}
    {snapshot.work.phase === 'running' ? <Text style={styles.syncStatus}>后台处理中…</Text> : null}
    {snapshot.work.phase === 'backoff' ? <Text style={styles.syncStatus}>后台处理将在稍后重试</Text> : null}
    {snapshot.phase === 'stale' ? <Text style={styles.syncError}>{'状态可能已过期：' + snapshot.read.error}</Text> : null}
    {maintenanceError ? <Text accessibilityRole="alert" style={styles.syncError}>{maintenanceError}</Text> : null}
    {background.phase === 'failed' ? <View style={listUI.notice}><Text accessibilityRole="alert" style={styles.syncError}>后台同步注册失败，回到应用时会重试；前台任务仍可继续。</Text><ListAction secondary icon="refresh" label="重试后台同步注册" onPress={() => { void backgroundRegistration.retry(); }} /></View> : null}
    {monitoring ? <Text style={styles.syncStatus}>持续监控所有任务；任务及下载、保存操作完成后自动停止。系统可能延迟或终止后台执行。{monitor.notificationsEnabled === false ? '完成通知未开启。' : ''}</Text> : monitor.stopReason === 'user' ? <Text style={styles.syncStatus}>持续监控已由你停止。</Text> : monitor.stopReason === 'timeout' ? <Text style={styles.syncError}>已达到系统后台运行时限，持续监控已停止；可重新开启。</Text> : monitor.stopReason === 'complete' ? <Text style={styles.syncStatus}>任务及相关操作已完成，持续监控已自动停止。</Text> : monitor.enabled ? <Text style={styles.syncError}>持续监控当前未运行，可重新开启。</Text> : monitor.stopReason === 'headless-failed' || monitor.stopReason === 'start-failed' ? <Text style={styles.syncError}>持续监控启动失败，请重试。</Text> : null}
    <ListFilters label="任务筛选" options={[{ id: 'all', label: '全部' }, { id: 'active', label: '进行中' }, { id: 'failed', label: '失败' }]} value={filter} onChange={value => { setFilter(value); setPageError(''); }} />
    <FlatList keyboardDismissMode="on-drag" data={snapshot.items} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={7} updateCellsBatchingPeriod={50} removeClippedSubviews
      keyExtractor={item => item.id} contentContainerStyle={styles.list} refreshing={refreshing} onRefresh={refresh}
      onEndReached={() => { if (pageBusy || pageError || !snapshot.nextCursor) return; setPageBusy(true); void session.loadMore().catch(() => setPageError('加载更多失败')).finally(() => setPageBusy(false)); }}
      ListFooterComponent={pageBusy ? <ActivityIndicator color={COLORS.primaryActive} /> : pageError ? <ListAction secondary icon="refresh" label="加载更多失败，点击重试" onPress={() => { setPageError(''); setPageBusy(true); void session.loadMore().catch(() => setPageError('加载更多失败')).finally(() => setPageBusy(false)); }} /> : !snapshot.nextCursor && snapshot.items.length ? <Text style={listUI.footer}>已显示全部任务</Text> : null} onEndReachedThreshold={0.6}
      ListEmptyComponent={<ListEmptyState icon={snapshot.phase === 'stale' ? 'info' : 'list_alt'}
        loading={snapshot.phase === 'cold'}
        title={snapshot.phase === 'stale' ? '任务读取失败' : snapshot.phase === 'cold' ? '正在读取任务…' : filter === 'active' ? '暂无进行中的任务' : filter === 'failed' ? '暂无失败任务' : '暂无任务'}
        description={snapshot.phase === 'stale' ? '请检查连接后重试，任务记录会保留。' : snapshot.phase === 'cold' ? '正在同步任务状态，请稍候。' : filter === 'active' ? '新提交的任务会在这里显示生成与下载进度。' : filter === 'failed' ? '出现异常的任务会集中显示在这里，方便查看和处理。' : '从一个灵感开始，生成后可在这里查看进度、下载和保存视频。'}
        action={snapshot.phase === 'cold' ? undefined : snapshot.phase === 'stale' ? { label: '重试读取任务', icon: 'refresh', onPress: refresh } : { label: '去生成视频', icon: 'movie_filter', onPress: () => router.push('/(tabs)/create') }}
        secondaryAction={snapshot.phase !== 'cold' && snapshot.phase !== 'stale' && filter !== 'all' ? { label: '查看全部任务', onPress: () => setFilter('all') } : undefined} />} renderItem={renderItem} />
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.xl },
  heading: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' },
  headingActions: { flexDirection: 'row', gap: 8 },
  title: { color: COLORS.text, fontSize: 29, fontWeight: '800' },
  subtitle: { color: COLORS.textMuted, marginTop: 7, lineHeight: 20 },
  syncStatus: { color: COLORS.primaryActive, marginTop: 5, fontSize: 12, lineHeight: 18 },
  syncError: { color: COLORS.danger, marginTop: 8, fontSize: 12, lineHeight: 18 },
  refresh: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  monitoring: { borderColor: COLORS.primaryActive, backgroundColor: COLORS.primarySoft },
  list: { gap: SPACING.md, paddingBottom: 130 },
});
