import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppIcon } from '../../src/ui/icons';
import { COLORS, SPACING } from '../../src/ui/theme';
import { mediaStore, taskStore, syncTasks } from '../../src/tasks/sync';
import { ensureTaskDownloaded, exportTaskVideo } from '../../src/tasks/media';
import { exportStatusLabel } from '../../src/gallery/presentation';
import type { TaskRecord } from '../../src/tasks/types';
import { formatTaskCreatedAt, formatTaskStatus, getTaskTiming } from '../../src/tasks/presentation';
import { readSettings } from '../../src/settings/storage';
import { getTaskMonitorStatus, startTaskMonitor, stopTaskMonitor } from '../../src/native/taskMonitor';
import { getBuiltinArtifactDownloadPolicy } from '../../src/workflows/providers/registry';
import { resolveLocalVideoSource } from '../../src/tasks/localMedia';

async function repairTaskMediaState(task: TaskRecord): Promise<TaskRecord> {
  if (task.downloadState !== 'DOWNLOADED' && !task.localUri) return task;
  const asset = await mediaStore.getPrimaryVideoByTaskId?.(task.id);
  const localUri = await resolveLocalVideoSource({ task, asset });
  if (localUri) {
    const patch = { localUri, downloadState: 'DOWNLOADED' as const, downloadError: undefined, downloadProgress: 1, updatedAt: Date.now() };
    if (task.localUri !== localUri || task.downloadState !== 'DOWNLOADED') await taskStore.updateMediaProjection(task.id, patch);
    if (asset && (asset.localPath !== localUri || asset.status !== 'downloaded')) await mediaStore.upsert({ ...asset, localPath: localUri, status: 'downloaded', updatedAt: patch.updatedAt });
    return { ...task, ...patch };
  }
  const downloadState = task.downloadState === 'DOWNLOAD_FAILED' ? 'DOWNLOAD_FAILED' as const : task.videoUrl ? 'IDLE' as const : 'DOWNLOAD_FAILED' as const;
  const patch = { localUri: undefined, downloadState, downloadError: downloadState === 'DOWNLOAD_FAILED' ? task.downloadError || '视频源文件不可用' : undefined, downloadProgress: undefined, updatedAt: Date.now() };
  await taskStore.updateMediaProjection(task.id, patch);
  if (asset && (asset.localPath || asset.status === 'downloaded')) await mediaStore.upsert({ ...asset, localPath: undefined, status: asset.sourceUrl ? 'queued' : 'failed', updatedAt: patch.updatedAt });
  return { ...task, ...patch };
}

async function repairTaskMediaPage(tasks: TaskRecord[]): Promise<TaskRecord[]> {
  return Promise.all(tasks.map((task) => repairTaskMediaState(task)));
}

export default function TasksScreen() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>();
  const [cursor, setCursor] = useState<{ createdAt: number; id: string }>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const mediaBusyRef = useRef(new Set<string>());
  const loadInFlight = useRef(false);
  const load = useCallback(async (manual = false) => { if (loadInFlight.current) return; loadInFlight.current = true; setSyncing(true); try { const synced = await syncTasks(); const page = await (taskStore as typeof taskStore & { listPage?: (options?: { limit?: number }) => Promise<{ items: TaskRecord[]; nextCursor?: { createdAt: number; id: string } }> }).listPage?.({ limit: 40 }); if (page) { setTasks(await repairTaskMediaPage(page.items)); setCursor(page.nextCursor); } else setTasks(await repairTaskMediaPage(synced)); setLastUpdatedAt(Date.now()); } catch (error) { if (manual) Alert.alert('刷新失败', error instanceof Error ? error.message : '任务状态同步失败'); } finally { loadInFlight.current = false; setSyncing(false); } }, []);
  const loadMore = useCallback(async () => { if (!cursor || loadingMore || !(taskStore as typeof taskStore & { listPage?: unknown }).listPage) return; setLoadingMore(true); try { const page = await (taskStore as typeof taskStore & { listPage: (options: { limit: number; cursor: { createdAt: number; id: string } }) => Promise<{ items: TaskRecord[]; nextCursor?: { createdAt: number; id: string } }> }).listPage({ limit: 40, cursor }); const repaired = await repairTaskMediaPage(page.items); setTasks((items) => [...items, ...repaired.filter((item) => !items.some((current) => current.id === item.id))]); setCursor(page.nextCursor); } finally { setLoadingMore(false); } }, [cursor, loadingMore]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const hasActiveTasks = tasks.some((item) => item.status === 'QUEUED' || item.status === 'RUNNING' || item.status === 'UNKNOWN');
  useEffect(() => { if (!hasActiveTasks) return; const timer = setInterval(() => void load(), 10000); return () => clearInterval(timer); }, [hasActiveTasks, load]);
  useEffect(() => { void getTaskMonitorStatus().then((value) => setMonitoring(value.running)); }, []);
  const toggleMonitoring = async () => { if (monitoring) { await stopTaskMonitor(); setMonitoring(false); return; } const activeIds = tasks.filter((item) => item.status === 'QUEUED' || item.status === 'RUNNING' || item.status === 'UNKNOWN').map((item) => item.id); if (await startTaskMonitor(activeIds)) setMonitoring(true); };
  const setMediaBusy = (id: string, busy: boolean) => {
    if (busy) mediaBusyRef.current.add(id); else mediaBusyRef.current.delete(id);
    setTasks((items) => items.map((item) => item.id === id ? { ...item } : item));
  };
  const remove = async (id: string) => { if (mediaBusyRef.current.has(id)) return; await taskStore.remove(id); setTasks((items) => items.filter((item) => item.id !== id)); };
  const retry = async (task: TaskRecord) => {
    if (mediaBusyRef.current.has(task.id)) return;
    setMediaBusy(task.id, true);
    try {
      const artifactPolicy = getBuiltinArtifactDownloadPolicy(task.adapterId);
      const asset = await mediaStore.getPrimaryVideoByTaskId?.(task.id);
      const recovered = await resolveLocalVideoSource({ task, asset });
      let current: TaskRecord = { ...task, localUri: recovered, downloadState: recovered ? 'DOWNLOADED' : 'IDLE', downloadError: undefined };
      const update = async (patch: Partial<TaskRecord>) => {
        current = { ...current, ...patch };
        if (!(await taskStore.updateMediaProjection(task.id, patch))) throw new Error('任务已删除');
        setTasks((items) => items.map((item) => item.id === task.id ? current : item));
      };
      const updated = recovered
        ? { ...current, downloadProgress: 1, updatedAt: Date.now() }
        : await ensureTaskDownloaded(current, { policy: { autoExportToGallery: false, keepPrivateCopy: true }, asset, ...artifactPolicy, onUpdate: update });
      if (recovered) await update({ localUri: recovered, downloadState: 'DOWNLOADED', downloadError: undefined, downloadProgress: 1, updatedAt: updated.updatedAt });
      setTasks((items) => items.map((item) => item.id === task.id ? updated : item));
    } catch (error) {
      Alert.alert('下载失败', error instanceof Error ? error.message : '视频下载失败');
    } finally { setMediaBusy(task.id, false); }
  };
  const retryExport = async (task: TaskRecord) => {
    if (mediaBusyRef.current.has(task.id)) return;
    setMediaBusy(task.id, true);
    try {
      const settings = await readSettings();
      const artifactPolicy = getBuiltinArtifactDownloadPolicy(task.adapterId);
      const asset = await mediaStore.getPrimaryVideoByTaskId?.(task.id);
      let current = task;
      const updated = await exportTaskVideo(task, { policy: { autoExportToGallery: settings.autoExportToGallery, keepPrivateCopy: settings.keepPrivateCopy }, asset, ...artifactPolicy, onUpdate: async (patch) => {
        current = { ...current, ...patch };
        if (!(await taskStore.updateMediaProjection(task.id, patch))) throw new Error('任务已删除');
        setTasks((items) => items.map((item) => item.id === task.id ? current : item));
      } });
      setTasks((items) => items.map((item) => item.id === task.id ? updated : item));
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '保存到系统相册失败');
    } finally { setMediaBusy(task.id, false); }
  };
  const updatedLabel = lastUpdatedAt == null ? '' : new Date(lastUpdatedAt).toTimeString().slice(0, 8);
 return <View style={styles.container}><View style={styles.heading}><View><Text style={styles.title}>任务队列</Text><Text style={styles.subtitle}>任务状态、下载进度和本地媒体统一管理。</Text>{syncing ? <Text style={styles.syncStatus}>正在刷新…</Text> : updatedLabel ? <Text style={styles.syncStatus}>已更新 {updatedLabel}</Text> : null}</View><View style={styles.headingActions}><Pressable accessibilityRole="button" accessibilityLabel={monitoring ? '停止持续监控' : '开启持续监控'} onPress={() => void toggleMonitoring()} disabled={!monitoring && !tasks.some((item) => item.status === 'QUEUED' || item.status === 'RUNNING' || item.status === 'UNKNOWN')} style={[styles.refresh, monitoring && styles.monitoring]}><AppIcon name={monitoring ? 'notifications_active' : 'notifications'} size={20} color={monitoring ? COLORS.primaryActive : COLORS.textMuted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="刷新任务" accessibilityState={{ busy: syncing, disabled: syncing }} disabled={syncing} onPress={() => void load(true)} style={[styles.refresh, syncing && styles.refreshing]}>{syncing ? <ActivityIndicator size="small" color={COLORS.primaryActive} /> : <AppIcon name="refresh" size={20} color={COLORS.textMuted} />}</Pressable></View></View><FlatList data={tasks} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={7} updateCellsBatchingPeriod={50} removeClippedSubviews keyExtractor={(item) => item.id} contentContainerStyle={styles.list} onEndReached={() => void loadMore()} onEndReachedThreshold={0.6} ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={COLORS.primaryActive} /> : null} ListEmptyComponent={<Text style={styles.empty}>{syncing ? '正在同步任务…' : '暂无任务'}</Text>} renderItem={({ item }) => { const exportLabel = exportStatusLabel(item); const terminalSuccess = item.status === 'SUCCESS' || item.status === 'PARTIAL_SUCCESS'; const needsExport = item.downloadState === 'DOWNLOADED' && item.exportState !== 'EXPORTED'; const exportActionLabel = item.exportState === 'EXPORT_FAILED' ? '重试保存到系统相册' : '保存到系统相册'; const mediaBusy = mediaBusyRef.current.has(item.id) || item.downloadState === 'ENQUEUED' || item.downloadState === 'DOWNLOADING' || item.exportState === 'QUEUED' || item.exportState === 'EXPORTING'; return <View style={styles.card}><View style={styles.header}><Text numberOfLines={1} style={styles.id}>{item.id}</Text><Text style={[styles.status, item.status === 'SUCCESS' ? styles.success : item.status === 'FAILED' ? styles.failure : item.status === 'RUNNING' ? styles.running : undefined]}>{formatTaskStatus(item.status)}</Text></View><Text numberOfLines={3} style={styles.prompt}>{item.prompt}</Text><Text style={styles.meta}>{item.resolution} · {item.duration}s</Text><TaskTiming task={item} />{item.syncError ? <Text style={styles.syncError}>{item.syncError}</Text> : null}{item.downloadState && terminalSuccess ? <View style={styles.downloadRow}><Text style={styles.downloadText}>{item.downloadState === 'DOWNLOADED' ? (exportLabel || '已下载到应用') : item.downloadState === 'DOWNLOAD_FAILED' ? item.downloadError || '下载失败' : `${item.downloadState}${item.downloadProgress ? ` ${Math.round(item.downloadProgress * 100)}%` : ''}`}</Text>{item.downloadState !== 'DOWNLOADED' && <Pressable accessibilityRole="button" accessibilityLabel={item.downloadState === 'DOWNLOAD_FAILED' ? '重试下载' : '下载视频'} accessibilityState={{ disabled: mediaBusy, busy: mediaBusy }} disabled={mediaBusy} onPress={() => void retry(item)} style={[styles.action, mediaBusy && styles.disabled]}><AppIcon name={item.downloadState === 'DOWNLOAD_FAILED' ? 'refresh' : 'download'} size={17} color={COLORS.primaryActive} /><Text style={styles.actionText}>{item.downloadState === 'DOWNLOAD_FAILED' ? '重试' : '下载'}</Text></Pressable>}{needsExport && <Pressable accessibilityRole="button" accessibilityLabel={exportActionLabel} accessibilityState={{ disabled: mediaBusy, busy: mediaBusy }} disabled={mediaBusy} onPress={() => void retryExport(item)} style={[styles.action, mediaBusy && styles.disabled]}><AppIcon name={item.exportState === 'EXPORT_FAILED' ? 'refresh' : 'download'} size={17} color={COLORS.primaryActive} /><Text style={styles.actionText}>{item.exportState === 'EXPORT_FAILED' ? '重试保存' : '保存到相册'}</Text></Pressable>}</View> : null}<Pressable disabled={mediaBusy} onPress={() => Alert.alert('移除任务', '仅移除本地记录和应用内副本。已保存到系统相册的视频会保留。', [{ text: '取消' }, { text: '移除', style: 'destructive', onPress: () => void remove(item.id) }])} style={[styles.remove, mediaBusy && styles.disabled]}><Text style={styles.removeText}>移除记录</Text></Pressable></View>; }} /></View>;
}

const TaskTiming = memo(function TaskTiming({ task }: { task: TaskRecord }) {
  const active = task.status === 'QUEUED' || task.status === 'RUNNING' || task.status === 'UNKNOWN';
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const timing = getTaskTiming(task, now);
  return <View style={styles.timing}><Text style={styles.timingText}>创建 {formatTaskCreatedAt(task.createdAt)}</Text><Text style={styles.timingText}>排队 {timing.queued}</Text><Text style={styles.timingText}>执行 {timing.running}</Text></View>;
});

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.xl }, heading: { position: 'relative', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingRight: 100 }, headingActions: { position: 'absolute', right: 0, top: 0, flexDirection: 'row', gap: 8, flexShrink: 0 }, title: { color: COLORS.text, fontSize: 29, fontWeight: '800' }, subtitle: { color: COLORS.textMuted, marginTop: 7, lineHeight: 20 }, syncStatus: { color: COLORS.primaryActive, marginTop: 5, fontSize: 11 }, syncError: { color: COLORS.danger, marginTop: 8, fontSize: 11 }, refresh: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, refreshing: { borderColor: COLORS.primaryActive, opacity: 0.8 }, monitoring: { borderColor: COLORS.primaryActive }, list: { gap: SPACING.md, paddingTop: SPACING.xl, paddingBottom: 130 }, empty: { color: COLORS.textSubtle, textAlign: 'center', marginTop: 64 }, card: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: 16, padding: SPACING.lg }, header: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md }, id: { color: COLORS.primaryActive, fontSize: 11, flex: 1, fontFamily: 'monospace' }, status: { color: '#fbbf24', fontSize: 11, fontWeight: '800' }, running: { color: COLORS.primaryActive }, success: { color: COLORS.success }, failure: { color: COLORS.danger }, prompt: { color: COLORS.text, marginTop: 11, lineHeight: 20 }, meta: { color: COLORS.textSubtle, marginTop: 11, fontSize: 12 }, timing: { gap: 4, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border }, timingText: { color: COLORS.textMuted, fontSize: 12, fontFamily: 'monospace' }, downloadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: COLORS.border }, downloadText: { color: COLORS.textMuted, fontSize: 12, flex: 1 }, action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.primarySoft }, actionText: { color: COLORS.primaryActive, fontSize: 12, fontWeight: '700' }, remove: { alignSelf: 'flex-end', marginTop: 12 }, removeText: { color: COLORS.textSubtle, fontSize: 12 }, disabled: { opacity: 0.5 } });
