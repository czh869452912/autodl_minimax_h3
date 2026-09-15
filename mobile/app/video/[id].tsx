import { userFacingError } from '../../src/media/mediaValidation';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import type { TaskRecord } from '../../src/tasks/types';
import { exportStatusLabel } from '../../src/gallery/presentation';
import { formatDownloadStatus, formatTaskStatus } from '../../src/tasks/presentation';
import { DownloadNetworkHelp } from '../../src/tasks/DownloadNetworkHelp';
import { taskProjectionEvents } from '../../src/tasks/taskProjectionEvents';
import { VideoPlayer } from '../../src/media/VideoPlayer';
import { AppIcon } from '../../src/ui/icons';
import { COLORS, SPACING } from '../../src/ui/theme';
import type { MediaAsset } from '../../src/media/types';
import { resolveLocalVideoSource } from '../../src/tasks/localMedia';
import { getTaskServices } from '../../src/tasks/taskServices';
import { openExternalVideo, shareVideo } from '../../src/media/unifiedPlayback';
import { probeVideoStructure } from '../../src/native/media';

export default function VideoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [redownloading, setRedownloading] = useState(false);
  const [localSource, setLocalSource] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [actionNotice, setActionNotice] = useState('');
  const readSequence = useRef(0);
  const focused = useRef(false);

  const reloadTaskAndAsset = useCallback(async () => {
    if (!focused.current) return null;
    const sequence = ++readSequence.current;
    try {
      const media = id ? await getTaskServices().mediaStore.get(id) : null;
      const value = id ? await getTaskServices().taskStore.get(media?.taskId || id) : null;
      const verifiedLocalSource = value ? await resolveLocalVideoSource({ task: value, asset: media }) : undefined;
      if (sequence !== readSequence.current) return null;
      setLocalSource(verifiedLocalSource);
      setAsset(media);
      setTask(value ?? null);
      setLoadError(undefined);
      return value;
    } catch {
      if (sequence === readSequence.current) setLoadError('作品状态读取失败，请重试');
      return null;
    } finally {
      if (sequence === readSequence.current) setLoaded(true);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    setLoaded(false);
    setTask(null); setAsset(null); setLocalSource(undefined); setLoadError(undefined);
    void reloadTaskAndAsset();
    const unsubscribe = taskProjectionEvents.subscribe(() => { void reloadTaskAndAsset(); });
    return () => { focused.current = false; readSequence.current++; unsubscribe(); };
  }, [reloadTaskAndAsset]));

  if (!loaded) return <View style={styles.center}><ActivityIndicator color={COLORS.primaryActive} /><Text style={styles.muted}>正在加载作品…</Text></View>;
  if (loadError && !task) return <View style={styles.center}><Text accessibilityRole="alert">{loadError}</Text><Pressable accessibilityRole="button" accessibilityLabel="重试读取作品" onPress={() => void reloadTaskAndAsset()} style={styles.backAction}><Text style={styles.backActionText}>重试</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="返回上一页" onPress={() => router.back()} style={styles.backAction}><Text style={styles.backActionText}>返回上一页</Text></Pressable></View>;
  if (!task) return <View style={styles.center}><Text style={styles.title}>作品不存在或已删除</Text><Pressable accessibilityRole="button" accessibilityLabel="返回上一页" onPress={() => router.back()} style={styles.backAction}><Text style={styles.backGlyph}>‹</Text><Text style={styles.backActionText}>返回上一页</Text></Pressable></View>;

  const generated = task.status === 'SUCCESS' || task.status === 'PARTIAL_SUCCESS';
  const downloadFailed = task.downloadState === 'DOWNLOAD_FAILED' && !localSource;
  const mediaBusy = redownloading || task.downloadState === 'DOWNLOADING' || task.downloadState === 'ENQUEUED';
  const source = localSource || (generated && !downloadFailed && !mediaBusy ? asset?.sourceUrl || task.videoUrl : '') || '';
  const canDownload = generated && !localSource && task.downloadError !== 'ARTIFACT_MEDIA_UNSUPPORTED';
  const errors = [task.syncError, !localSource ? task.downloadError : undefined, task.exportError].filter(Boolean);
  const downloadPending = generated && mediaBusy;
  const emptyTitle = downloadPending ? (redownloading ? '正在准备下载…' : formatDownloadStatus(task.downloadState, task.downloadProgress)) : downloadFailed ? '视频下载失败' : task.status === 'FAILED' ? '视频生成失败' : task.status === 'CANCELLED' ? '任务已取消' : !generated ? `生成${formatTaskStatus(task.status)}` : '视频源不可用';
  const copyPrompt = async () => {
    if (!task.prompt.trim()) { Alert.alert('无法复制', '当前作品没有 Prompt'); return; }
    try {
      await Clipboard.setStringAsync(task.prompt);
      setActionNotice('Prompt 已复制到剪贴板');
    } catch {
      setActionNotice('复制失败，请稍后重试');
    }
  };
  const saveToGallery = async () => {
    if (!task || exporting || !localSource) return;
    setExporting(true);
    try {
      await getTaskServices().taskCommandService.requestExport(task.id, { keepPrivateCopy: true });
      await reloadTaskAndAsset();
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '保存到系统相册失败');
    } finally { setExporting(false); }
  };
  const redownloadInvalidSource = async (invalidSource: string) => {
    if (!task || !localSource || invalidSource !== localSource || redownloading) return;
    setRedownloading(true);
    try {
      await getTaskServices().taskCommandService.requestRedownload(task.id);
      await reloadTaskAndAsset();
      Alert.alert('已开始重新下载', '已清除损坏的本地副本并开始重新下载');
    } catch (error) {
      Alert.alert('重新下载失败', error instanceof Error ? error.message : '无法重新下载视频');
    } finally { setRedownloading(false); }
  };

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><ScrollView testID="detail-content" style={styles.container} contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回上一页" onPress={() => router.back()} hitSlop={10} style={styles.back}><Text style={[styles.backGlyph, { color: COLORS.primaryActive }]}>‹</Text><Text style={styles.backText}>返回上一页</Text></Pressable><Text style={styles.title}>视频详情</Text></View>
    {loadError ? <Pressable accessibilityRole="button" accessibilityLabel="重试读取作品" onPress={() => void reloadTaskAndAsset()}><Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{loadError} · 点击重试</Text></Pressable> : null}
    <View testID="adaptive-media-region" style={source ? styles.mediaRegion : styles.emptyMediaRegion}><View testID="video-frame" style={styles.player}>{source ? <VideoPlayer source={source} poster={[asset?.posterPath, task.thumbnailUrl].find(uri => uri?.includes('/posters/sw-v3-'))} validateSource={localSource && source === localSource ? probeVideoStructure : undefined} onInvalidSource={localSource && source === localSource ? redownloadInvalidSource : undefined} recovering={redownloading} /> : <View accessibilityLabel={emptyTitle} accessibilityLiveRegion="polite" style={styles.sourceEmpty}>{downloadPending ? <ActivityIndicator color={COLORS.primaryActive} /> : <AppIcon name="movie_filter" size={30} color={COLORS.textSubtle} />}<Text style={styles.sourceEmptyText}>{emptyTitle}</Text><Text style={styles.sourceEmptyHint}>{downloadPending || downloadFailed ? '视频已生成，下载完成后即可播放和保存' : generated ? '请等待下载完成或重新下载视频' : '可在任务队列查看生成进度和状态'}</Text></View>}</View></View>
    {actionNotice ? <Text accessibilityLiveRegion="polite" style={styles.muted}>{actionNotice}</Text> : null}
    {(errors.length > 0 || canDownload) ? <View style={styles.recoveryCard}>
      <Text style={styles.sectionTitle}>{downloadFailed ? '下载未完成' : errors.length ? '任务异常' : '下载到应用'}</Text>
      {errors.map((error, index) => <Text key={index} accessibilityRole="alert" style={styles.errorText}>{userFacingError(error)}</Text>)}
      {canDownload ? <Pressable accessibilityRole="button" accessibilityLabel={downloadFailed ? '重试下载视频' : '下载视频'} accessibilityState={{ disabled: mediaBusy, busy: mediaBusy }} disabled={mediaBusy} style={[styles.exportButton, mediaBusy && styles.disabled]} onPress={() => {
        if (mediaBusy) return;
        setRedownloading(true);
        void getTaskServices().taskCommandService.requestDownload(task.id).then(() => reloadTaskAndAsset()).catch(() => setActionNotice('下载未能开始，请刷新任务状态后重试')).finally(() => setRedownloading(false));
      }}><Text style={styles.exportButtonText}>{redownloading ? '正在准备下载…' : mediaBusy ? formatDownloadStatus(task.downloadState, task.downloadProgress) : downloadFailed ? '重试下载视频' : '下载视频'}</Text></Pressable> : null}
      {errors.length ? <Pressable accessibilityRole="button" accessibilityLabel="复制诊断详情" style={styles.diagnosticButton} onPress={() => void Clipboard.setStringAsync(errors.join('\n')).then(() => setActionNotice('诊断已复制')).catch(() => setActionNotice('诊断复制失败'))}><AppIcon name="content_copy" size={17} color={COLORS.primaryActive} /><Text style={styles.diagnosticText}>复制诊断详情</Text></Pressable> : null}
      {downloadFailed ? <DownloadNetworkHelp error={task.downloadError} /> : null}
    </View> : null}
    {localSource ? <View style={styles.exportRow}><Pressable accessibilityRole="button" style={styles.exportButton} onPress={() => void shareVideo(localSource).catch(() => setActionNotice('分享失败，请重试'))}><Text style={styles.exportButtonText}>分享视频</Text></Pressable><Pressable accessibilityRole="button" style={styles.exportButton} onPress={() => void openExternalVideo(localSource).catch(() => setActionNotice('没有可用的外部播放器'))}><Text style={styles.exportButtonText}>使用外部播放器</Text></Pressable></View> : null}
    <Text style={styles.meta}>{task.resolution} · {task.duration}s · 生成：{formatTaskStatus(task.status)} · {localSource ? '已下载' : formatDownloadStatus(task.downloadState, task.downloadProgress)}</Text>
    {localSource || task.exportState === 'EXPORTED' ? <View style={styles.exportRow}><Text accessibilityLiveRegion="polite" style={styles.exportStatus}>{exporting || task.exportState === 'QUEUED' || task.exportState === 'EXPORTING' ? '正在保存到相册' : exportStatusLabel(task) || '尚未保存到相册'}</Text>{localSource && task.exportState !== 'EXPORTED' && <Pressable accessibilityRole="button" accessibilityLabel={task.exportState === 'EXPORT_FAILED' ? '重试保存到系统相册' : '保存到系统相册'} disabled={exporting || task.exportState === 'QUEUED' || task.exportState === 'EXPORTING'} onPress={() => void saveToGallery()} style={[styles.exportButton, (exporting || task.exportState === 'QUEUED' || task.exportState === 'EXPORTING') && styles.disabled]}><Text style={styles.exportButtonText}>{exporting || task.exportState === 'QUEUED' || task.exportState === 'EXPORTING' ? '保存中…' : task.exportState === 'EXPORT_FAILED' ? '重试保存到系统相册' : '保存到系统相册'}</Text></Pressable>}</View> : null}
    <View testID="bottom-prompt-card" style={styles.promptCard}><View style={styles.promptHeader}><Text style={styles.sectionTitle}>Prompt</Text><Text style={styles.promptCount}>{task.prompt.length.toLocaleString()} 字符</Text></View><ScrollView accessibilityLabel="滚动 Prompt" nestedScrollEnabled style={styles.promptScroll}><Text selectable style={styles.prompt}>{task.prompt || '暂无 Prompt'}</Text></ScrollView><Pressable accessibilityRole="button" accessibilityLabel="复制 Prompt" onPress={() => void copyPrompt()} style={styles.copy}><AppIcon name="content_copy" size={18} color={COLORS.onPrimary} /><Text style={styles.copyText}>复制 Prompt</Text></Pressable></View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background }, container: { flex: 1, backgroundColor: COLORS.background }, content: { flexGrow: 1, padding: SPACING.lg, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: COLORS.background, padding: SPACING.xl }, muted: { color: COLORS.textMuted },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, marginBottom: SPACING.lg }, back: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 5 }, backText: { color: COLORS.primaryActive, fontSize: 14, fontWeight: '700' }, title: { color: COLORS.text, fontSize: 24, fontWeight: '800' },
  emptyMediaRegion: { height: 220 },
  sourceEmptyHint: { color: COLORS.textMuted, fontSize: 12, lineHeight: 20, textAlign: 'center', paddingHorizontal: 20 },
  recoveryCard: { marginTop: SPACING.md, padding: SPACING.lg, gap: SPACING.md, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  errorText: { color: COLORS.danger, fontSize: 13, lineHeight: 21 },
  diagnosticButton: { minHeight: 48, padding: 12, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primarySoft },
  diagnosticText: { color: COLORS.primaryActive, fontWeight: '600' },
  mediaRegion: { flex: 1, minHeight: 240 }, player: { flex: 1, minHeight: 220, width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: COLORS.mediaBackground }, sourceEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.surface }, sourceEmptyText: { color: COLORS.textMuted, fontSize: 13 }, meta: { color: COLORS.textMuted, marginTop: 13, fontSize: 12 },
  exportRow: { marginTop: SPACING.md, gap: SPACING.sm }, exportStatus: { color: COLORS.textMuted, fontSize: 12 }, exportButton: { minHeight: 48, borderRadius: 11, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, exportButtonText: { color: COLORS.onPrimary, fontWeight: '800' }, disabled: { opacity: 0.5 }, promptCard: { marginTop: SPACING.lg, padding: SPACING.lg, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, promptHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: SPACING.sm }, sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' }, promptCount: { color: COLORS.textSubtle, fontSize: 13 }, promptScroll: { maxHeight: 240 }, prompt: { color: COLORS.text, lineHeight: 22, fontSize: 14, paddingBottom: 4 },
  copy: { minHeight: 48, marginTop: SPACING.md, borderRadius: 11, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, copyText: { color: COLORS.onPrimary, fontWeight: '800' }, backAction: { minHeight: 48, paddingHorizontal: 16, borderRadius: 11, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', gap: 7 }, backActionText: { color: COLORS.onPrimary, fontWeight: '800' }, backGlyph: { color: COLORS.onPrimary, fontSize: 27, lineHeight: 24 },
});
