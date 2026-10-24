import { useCallback, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useRouter } from 'expo-router';
import { getDatabase } from '../storage/databaseClient';
import { creativeService, exportCreativeVersion } from './runtime';
import type { CreativeDraft } from './drafts';
import type { AssetVersion } from './types';
import { VideoPlayer } from '../media/VideoPlayer';
import { ListAction } from '../ui/ListPageUI';
import { COLORS } from '../ui/theme';
import { creativeUI as s } from './creativeUI';
import { createId } from '../ids';

export const creativeJobLabel = (status: string) => ({ DRAFT: '准备中', VALIDATING: '检查生成条件', READY_TO_SUBMIT: '等待提交', SUBMITTING: '正在提交', QUEUED: '排队中', RUNNING: '正在生成', SUCCEEDED: '生成已完成', PARTIAL_SUCCEEDED: '部分生成完成', FAILED: '生成未完成，请查看原因', CANCELLED: '已取消', UNKNOWN: '暂时无法确认结果，请核查原任务' }[status] ?? '正在读取进度');

export function CreativeResults({ draft, disabled = false }: { draft: CreativeDraft; disabled?: boolean }) {
  const router = useRouter();
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [selected, setSelected] = useState<string>();
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    const refresh = async () => {
      const rows = draft.target_asset_id ? await creativeService().versions(draft.target_asset_id) : [];
      const job = draft.job_id ? await getDatabase().getFirstAsync<{ status: string }>('SELECT status FROM workflow_jobs WHERE id=?', draft.job_id) : null;
      if (active) { setVersions(rows); setStatus(job?.status ?? ''); }
    };
    void refresh().catch(() => { if (active) setError('结果读取失败，请稍后重新打开'); });
    const timer = setInterval(() => void refresh().catch(() => undefined), 2500);
    return () => { active = false; clearInterval(timer); };
  }, [draft.id, draft.target_asset_id, draft.job_id]));
  const current = versions.find(v => v.id === selected) ?? versions.find(v => v.recipe.jobId === draft.job_id) ?? versions[0];
  const work = async (fn: () => Promise<unknown>) => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  const continueWith = async (video: boolean) => {
    if (!current) return;
    const result = await creativeService().execute(video
      ? { name: 'draft.createVideo', payload: { versionId: current.id, projectId: draft.project_id ?? undefined, shotId: draft.shot_id ?? undefined } }
      : { name: 'draft.createImage', payload: { fromVersionId: current.id, projectId: draft.project_id ?? undefined, shotId: draft.shot_id ?? undefined } }, createId());
    if (result.status === 'completed') router.push({ pathname: video ? '/creative-draft/[id]' : '/image-draft/[id]', params: { id: result.value.draftId } });
  };
  return <View style={{ gap: 12 }}>
    {draft.job_id ? <View style={s.row}><Text accessibilityLiveRegion="polite" style={s.muted}>{versions.some(v => v.recipe.jobId === draft.job_id && v.state === 'AVAILABLE') ? '本次成果已就绪' : creativeJobLabel(status)}</Text><ListAction label="查看本次任务" secondary onPress={() => router.push({ pathname: '/creative-task/[id]', params: { id: draft.job_id! } })} /></View> : null}
    {current ? <>
      {current.state === 'AVAILABLE' && current.relativePath ? current.mime?.startsWith('video/') ? <VideoPlayer source={`${FileSystem.documentDirectory}${current.relativePath}`} /> : <Image accessibilityLabel={`当前图片，版本 ${current.versionNo}`} source={{ uri: `${FileSystem.documentDirectory}${current.relativePath}` }} style={s.preview} resizeMode="contain" /> : <Text style={s.muted}>原文件尚不可用，请在素材详情中恢复。</Text>}
      <Text style={s.muted}>正在查看版本 {current.versionNo}{draft.job_id && current.recipe.jobId !== draft.job_id ? ' · 历史结果' : ''} · 不自动替换已采用版本</Text>
      {versions.length > 1 ? <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{versions.map(v => <Pressable key={v.id} accessibilityRole="button" accessibilityLabel={`查看版本 ${v.versionNo}`} accessibilityState={{ selected: v.id === current.id }} onPress={() => setSelected(v.id)} style={{ padding: 6, minWidth: 64, minHeight: 48, borderWidth: 2, borderRadius: 8, borderColor: v.id === current.id ? COLORS.primary : COLORS.border }}>
        {v.relativePath && v.state === 'AVAILABLE' && v.mime?.startsWith('image/') ? <Image source={{ uri: `${FileSystem.documentDirectory}${v.relativePath}` }} style={{ width: 64, height: 64 }} /> : null}<Text style={s.muted}>版本 {v.versionNo}</Text>
      </Pressable>)}</ScrollView> : null}
      <ListAction label={draft.shot_id ? '用于此镜头' : '保存到相册'} disabled={busy || disabled || current.state !== 'AVAILABLE'} onPress={() => void work(async () => {
        if (draft.shot_id && draft.project_id) {
          const shot = (await creativeService().shots(draft.project_id)).find(s => s.id === draft.shot_id);
          if (!shot) throw new Error('镜头已不存在，请返回项目检查');
          await creativeService().execute({ name: 'shot.selectOutput', payload: { id: shot.id, expectedRevision: shot.revision, slot: draft.provider_id === 'novelai' ? 'selected_image' : 'selected_video', versionId: current.id } }, createId());
          setNotice('此镜头已采用当前版本');
        } else { await exportCreativeVersion(current.id); setNotice('已加入保存队列，可在素材详情查看保存状态'); }
      })} />
      {draft.provider_id === 'novelai' ? <View style={s.row}>
        <ListAction label="继续修改" secondary disabled={busy || disabled} onPress={() => void work(() => continueWith(false))} />
        <ListAction label="制作视频" secondary disabled={busy || disabled || current.state !== 'AVAILABLE'} onPress={() => void work(() => continueWith(true))} />
      </View> : null}
      <ListAction label="查看素材与版本" secondary onPress={() => router.push({ pathname: '/creative-asset/[id]', params: { id: current.assetId, versionId: current.id, ...(draft.project_id ? {projectId:draft.project_id} : {}) } })} />
    </> : <View style={s.card}><Text style={s.title}>{draft.job_id ? (['FAILED', 'CANCELLED', 'UNKNOWN'].includes(status) ? '本次尚无可用成果' : '你的创作正在这里继续') : '从画面描述开始'}</Text><Text style={s.muted}>{draft.job_id ? (['FAILED', 'CANCELLED', 'UNKNOWN'].includes(status) ? '请打开本次任务查看原因与处理方式。' : '结果就绪后会显示在此页，可离开后回来查看。') : '生成后可在这里看图、修改，或继续制作视频。'}</Text></View>}
    {notice ? <Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </View>;
}
