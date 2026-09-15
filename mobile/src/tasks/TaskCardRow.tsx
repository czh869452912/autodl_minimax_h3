import { userFacingError } from '../media/mediaValidation';
import { memo, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/icons';
import { COLORS, SPACING } from '../ui/theme';
import { exportStatusLabel } from '../gallery/presentation';
import { formatDownloadStatus, formatTaskCreatedAt, formatTaskStatus, getTaskTiming } from './presentation';
import type { TaskCard } from './taskCard';
import { DownloadNetworkHelp } from './DownloadNetworkHelp';
export const TaskCardRow = memo(function TaskCardRow({ item, busy, onDownload, onExport, onRemove, onOpen, onCancel, onCancelMedia }: {
 onCancel?(id: string): void; onCancelMedia?(id: string, kind: 'ARTIFACT_DOWNLOAD' | 'EXPORT'): void;
 item: TaskCard; busy: boolean; onDownload(item: TaskCard): void; onExport(item: TaskCard): void; onRemove(id: string): void; onOpen(id: string): void;
}) { const exportLabel = item.compatibilityState && item.compatibilityState !== 'SUCCEEDED' && item.exportState === 'EXPORTED' ? '原件已保存到相册' : exportStatusLabel(item); const terminalSuccess = item.status === 'SUCCESS' || item.status === 'PARTIAL_SUCCESS';
  const mediaFailure = terminalSuccess
    ? item.downloadState === 'DOWNLOAD_FAILED' ? '下载失败' : item.exportState === 'EXPORT_FAILED' ? '保存失败' : undefined
    : undefined;
  const generationLabel = item.status === 'SUCCESS' ? '生成完成' : formatTaskStatus(item.status);
  const statusLabel = mediaFailure
    ? item.status === 'PARTIAL_SUCCESS' ? `${generationLabel} · ${mediaFailure}` : mediaFailure
    : generationLabel;
  const statusStyle = mediaFailure || item.status === 'FAILED' ? styles.failure
    : item.status === 'SUCCESS' ? styles.success : item.status === 'RUNNING' ? styles.running : undefined;
  const compatibilityFailed = item.downloadState === 'DOWNLOAD_FAILED' && Boolean(item.downloadError?.startsWith('ARTIFACT_COMPATIBILITY_')); const needsExport = (item.downloadState === 'DOWNLOADED' || compatibilityFailed) && item.exportState !== 'EXPORTED'; const exportActionLabel = compatibilityFailed ? '保存原件到系统相册' : item.exportState === 'EXPORT_FAILED' ? '重试保存到系统相册' : '保存到系统相册'; const mediaBusy = busy || item.downloadState === 'ENQUEUED' || item.downloadState === 'DOWNLOADING' || item.exportState === 'QUEUED' || item.exportState === 'EXPORTING'; return <View style={styles.card}><View style={styles.header}><Text numberOfLines={1} style={styles.id}>{item.id.slice(0, 8)}</Text><Text style={[styles.status, statusStyle]}>{statusLabel}</Text></View><Text numberOfLines={3} style={styles.prompt}>{item.prompt || '暂无 Prompt'}</Text><Text style={styles.meta}>{item.resolution} · {item.duration}s</Text><TaskTiming task={item} />{item.syncError ? <Text style={styles.syncError}>{userFacingError(item.syncError)}</Text> : null}{item.downloadState && terminalSuccess ? <View style={styles.downloadRow}><Text style={styles.downloadText}>{item.downloadState === 'DOWNLOADED' ? (exportLabel || '已下载到应用') : item.downloadState === 'DOWNLOAD_FAILED' ? [userFacingError(item.downloadError) || '下载失败', compatibilityFailed && item.exportState === 'EXPORTED' ? '原件已保存到系统相册' : ''].filter(Boolean).join('；') : formatDownloadStatus(item.downloadState, item.downloadProgress)}</Text>{item.downloadState !== 'DOWNLOADED' && item.downloadError !== 'ARTIFACT_MEDIA_UNSUPPORTED' && <Pressable accessibilityRole="button" accessibilityLabel={item.downloadState === 'DOWNLOAD_FAILED' ? '重试下载' : '下载视频'} accessibilityState={{ disabled: mediaBusy, busy: mediaBusy }} disabled={mediaBusy} onPress={() => void onDownload(item)} style={({ pressed }) => [styles.action, pressed && styles.pressed, mediaBusy && styles.disabled]}><AppIcon name={item.downloadState === 'DOWNLOAD_FAILED' ? 'refresh' : 'download'} size={17} color={COLORS.primaryActive} />{(item.downloadState === 'DOWNLOADING' || item.downloadState === 'ENQUEUED') ? <ActivityIndicator size="small" /> : null}<Text style={styles.actionText}>{item.downloadState === 'DOWNLOAD_FAILED' ? '重试' : item.downloadState === 'DOWNLOADING' ? '下载中' : item.downloadState === 'ENQUEUED' ? '等待下载' : '下载'}</Text></Pressable>}{needsExport && <Pressable accessibilityRole="button" accessibilityLabel={exportActionLabel} accessibilityState={{ disabled: mediaBusy, busy: mediaBusy }} disabled={mediaBusy} onPress={() => void onExport(item)} style={({ pressed }) => [styles.action, pressed && styles.pressed, mediaBusy && styles.disabled]}><AppIcon name={item.exportState === 'EXPORT_FAILED' ? 'refresh' : 'download'} size={17} color={COLORS.primaryActive} /><Text style={styles.actionText}>{compatibilityFailed ? '保存原件' : item.exportState === 'EXPORT_FAILED' ? '重试保存' : '保存到相册'}</Text></Pressable>}</View> : null}{item.downloadState === 'DOWNLOADING' && item.downloadProgress != null && Number.isFinite(item.downloadProgress) ? <View accessibilityRole="progressbar" accessibilityLabel="下载进度" accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.max(0, Math.min(1, item.downloadProgress)) * 100) }} style={{ height: 6, marginTop: 8, borderRadius: 3, backgroundColor: COLORS.border }}><View style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.primaryActive, width: `${Math.max(0, Math.min(1, item.downloadProgress)) * 100}%` }} /></View> : null}{item.canCancel && onCancel ? <Pressable accessibilityLabel="取消本地排队" accessibilityRole="button" disabled={busy} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed, busy && styles.disabled]} onPress={() => Alert.alert('取消本地排队？', '仅尚未提交到服务端的任务可以取消。', [{ text: '保留' }, { text: '确认取消', onPress: () => onCancel(item.id) }])}><Text style={styles.secondaryText}>取消本地排队</Text></Pressable> : item.status === 'QUEUED' || item.status === 'RUNNING' ? <Text style={styles.meta}>提交已开始或服务端已受理，当前无法取消生成</Text> : null}
{item.downloadState === 'DOWNLOAD_FAILED' ? <DownloadNetworkHelp error={item.downloadError} /> : null}{onCancelMedia && (item.downloadState === 'ENQUEUED' || item.downloadState === 'DOWNLOADING' || item.exportState === 'QUEUED') ? <Pressable accessibilityRole="button" disabled={busy} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed, busy && styles.disabled]} onPress={() => onCancelMedia(item.id, item.downloadState === 'ENQUEUED' || item.downloadState === 'DOWNLOADING' ? 'ARTIFACT_DOWNLOAD' : 'EXPORT')}><Text style={styles.secondaryText}>{item.downloadState === 'ENQUEUED' || item.downloadState === 'DOWNLOADING' ? '取消下载' : '取消待保存'}</Text></Pressable> : null}<View style={styles.footer}><Pressable accessibilityRole="button" accessibilityLabel="查看任务详情" onPress={() => onOpen(item.id)} style={({ pressed }) => [styles.details, pressed && styles.pressed]}><Text style={styles.actionText}>查看详情 ›</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="移除任务记录" accessibilityState={{ disabled: mediaBusy }} disabled={mediaBusy} onPress={() => Alert.alert('移除任务', '仅移除本地记录和应用内副本，不会取消服务端生成。已保存到系统相册的视频会保留。', [{ text: '取消' }, { text: '移除', style: 'destructive', onPress: () => void onRemove(item.id) }])} style={({ pressed }) => [styles.remove, pressed && styles.pressed, mediaBusy && styles.disabled]}><Text style={styles.removeText}>移除记录</Text></Pressable></View></View>; });
const TaskTiming = memo(function TaskTiming({ task }: { task: TaskCard }) {
  const active = task.status === 'QUEUED' || task.status === 'RUNNING' || task.status === 'UNKNOWN';
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const timing = useMemo(() => getTaskTiming(task, now), [task, now]);
  return <View style={styles.timing}><Text style={styles.timingText}>创建 {formatTaskCreatedAt(task.createdAt)}</Text><Text style={styles.timingText}>排队 {timing.queued}</Text><Text style={styles.timingText}>执行 {timing.running}</Text></View>;
});


const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: 16, padding: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  id: { color: COLORS.textMuted, fontSize: 12, flex: 1, fontFamily: 'monospace' },
  status: { flexShrink: 1, color: COLORS.warning, fontSize: 12, fontWeight: '700', backgroundColor: COLORS.surfaceRaised, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' },
  running: { color: COLORS.primaryActive, backgroundColor: COLORS.primarySoft },
  success: { color: COLORS.success, backgroundColor: COLORS.successSoft },
  failure: { color: COLORS.danger, backgroundColor: COLORS.dangerSoft },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  details: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: COLORS.primarySoft, justifyContent: 'center' },
  prompt: { color: COLORS.text, marginTop: 11, fontSize: 14, lineHeight: 22 },
  meta: { color: COLORS.textSubtle, marginTop: 8, fontSize: 12, lineHeight: 19 },
  timing: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: COLORS.background },
  timingText: { color: COLORS.textMuted, fontSize: 12, lineHeight: 18 },
  syncError: { color: COLORS.danger, marginTop: 10, fontSize: 13, lineHeight: 20 },
  downloadRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  downloadText: { color: COLORS.textMuted, fontSize: 12, lineHeight: 19, flexGrow: 1, flexShrink: 1, flexBasis: '100%' },
  action: { minHeight: 48, minWidth: 48, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.primaryActive, backgroundColor: COLORS.primarySoft },
  actionText: { color: COLORS.primaryActive, fontSize: 12, fontWeight: '700' },
  secondaryAction: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  secondaryText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  remove: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-end', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  removeText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
