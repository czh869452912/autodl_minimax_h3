import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { SectionHeading, TextAction } from './WorkbenchUI';
import { MediaPreview } from './MediaPreview';
import { defaultNovelAiDraft, novelAiDraftInput } from './novelAiProtocol';
import {ImageMetadataPanel} from './ImageMetadataPanel';

export const creativeJobLabel = (status: string) => ({ DRAFT: '准备中', VALIDATING: '检查生成条件', READY_TO_SUBMIT: '等待提交', SUBMITTING: '正在提交', QUEUED: '排队中', RUNNING: '正在生成', SUCCEEDED: '生成已完成', PARTIAL_SUCCEEDED: '部分生成完成', FAILED: '生成未完成，请查看原因', CANCELLED: '已取消', UNKNOWN: '暂时无法确认结果，请核查原任务' }[status] ?? '正在读取进度');

export function CreativeResults({ draft, disabled = false }: { draft: CreativeDraft; disabled?: boolean }) {
  const router = useRouter();
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [selected, setSelected] = useState<string>();
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fullScreen,setFullScreen]=useState(false);
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
  const continueWith = async (video: boolean, action?: 'img2img'|'infill', enhance=false) => {
    if (!current) return;
    const parsed=novelAiDraftInput.safeParse(current.recipe.input), recipe=parsed.success?parsed.data:defaultNovelAiDraft;
    const result = await creativeService().execute(video
      ? { name: 'draft.createVideo', payload: { versionId: current.id, projectId: draft.project_id ?? undefined, shotId: draft.shot_id ?? undefined } }
      : { name: 'draft.createImage', payload: { fromVersionId: current.id, projectId: draft.project_id ?? undefined, shotId: draft.shot_id ?? undefined, ...(action ? {input:{...recipe,action,enhance,sourceVersionId:current.id,maskVersionId:null,maskStrokes:[],...(enhance?{samples:1,strength:0.2,noise:0,seed:null}: {})}} : {}) } }, createId());
    if (result.status === 'completed') {
      const target = { pathname: video ? '/creative-draft/[id]' as const : '/image-draft/[id]' as const, params: { id: result.value.draftId } };
      if (video) router.push(target); else router.replace(target);
    }
  };
  const pending = ['VALIDATING', 'READY_TO_SUBMIT', 'SUBMITTING', 'QUEUED', 'RUNNING'].includes(status);
  const needsAttention = ['FAILED', 'CANCELLED', 'UNKNOWN', 'PARTIAL_SUCCEEDED'].includes(status);
  const recipe=current?.recipe.input as {width?:number;height?:number;seed?:number} | undefined;
  const dimensions=(current?.recipe.output??recipe) as {width?:number;height?:number}|undefined;
  const aspect=dimensions?.width && dimensions?.height ? dimensions.width / dimensions.height : 1;
  return <View style={{ gap: 12 }}>
    {draft.job_id ? <View style={[s.card, { borderWidth: 0, paddingVertical: 8, backgroundColor: needsAttention ? COLORS.dangerSoft : COLORS.primarySoft }]}><View style={s.row}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>{pending ? <ActivityIndicator size="small" color={COLORS.primaryActive} /> : null}<Text accessibilityLiveRegion="polite" style={[s.body, { fontSize: 14, flexShrink: 1 }]}>{creativeJobLabel(status)}</Text></View>
      <TextAction label={status === 'UNKNOWN' ? '核查原任务' : '查看本次任务'} onPress={() => router.push({ pathname: '/creative-task/[id]', params: { id: draft.job_id! } })} />
    </View></View> : null}
    {current ? <>
      <SectionHeading title={draft.state === 'EDITING' ? '参考结果' : '创作结果'} detail={`版本 ${current.versionNo}`} />
      {current.state === 'AVAILABLE' && current.relativePath ? current.mime?.startsWith('video/') ? <VideoPlayer source={`${FileSystem.documentDirectory}${current.relativePath}`} /> : <Pressable accessibilityRole="button" accessibilityLabel="全屏查看图片" onPress={()=>setFullScreen(true)}><Image accessibilityLabel={`当前图片，版本 ${current.versionNo}`} source={{ uri: `${FileSystem.documentDirectory}${current.relativePath}` }} style={{width:'100%',aspectRatio:aspect,minHeight:240,maxHeight:640,borderRadius:16,backgroundColor:COLORS.mediaBackground}} resizeMode="contain" /></Pressable> : <Text style={s.muted}>原文件尚不可用，请在素材详情中恢复。</Text>}
      {draft.provider_id==='novelai' && recipe ? <Text selectable style={s.muted}>{dimensions?.width} × {dimensions?.height} · Seed {recipe.seed ?? '未知'}</Text> : null}
      {current.mime?.startsWith('image/')?<ImageMetadataPanel key={current.id} version={current} />:null}
      {current.mime?.startsWith('image/') && current.state==='AVAILABLE'?<TextAction label="超分图片 · 2×" disabled={busy || disabled} onPress={()=>void work(async()=>{const result=await creativeService().execute({name:'draft.createUpscale',payload:{versionId:current.id,projectId:draft.project_id??undefined}},createId());if(result.status==='completed')router.push({pathname:'/image-draft/[id]',params:{id:result.value.draftId}});})} />:null}
      <Text style={s.muted}>{draft.job_id && current.recipe.jobId !== draft.job_id ? '正在查看历史结果 · ' : ''}选择与预览不会改变镜头已采用的版本。</Text>
      {versions.length > 1 ? <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{versions.map(v => <Pressable key={v.id} accessibilityRole="button" accessibilityLabel={`查看版本 ${v.versionNo}`} accessibilityState={{ selected: v.id === current.id }} onPress={() => setSelected(v.id)} style={{ padding: 6, minWidth: 64, minHeight: 48, borderWidth: 2, borderRadius: 8, borderColor: v.id === current.id ? COLORS.primary : COLORS.border }}>
        <MediaPreview version={v} kind={draft.provider_id === 'novelai' ? 'image' : 'video'} label={`版本 ${v.versionNo} 预览`} style={{ width: 64, aspectRatio: 1 }} /><Text style={s.muted}>版本 {v.versionNo}</Text>
      </Pressable>)}</ScrollView> : null}
      {draft.state === 'SUBMITTED' && draft.provider_id === 'novelai' && current.recipe.input ? <ListAction label="继续修改" disabled={busy || disabled} onPress={() => void work(() => continueWith(false))} /> : null}
      {draft.provider_id==='novelai'?<View style={s.row}><TextAction label="以此图生成" disabled={busy || disabled || current.state!=='AVAILABLE'} onPress={()=>void work(()=>continueWith(false,'img2img'))} /><TextAction label="局部重绘" disabled={busy || disabled || current.state!=='AVAILABLE'} onPress={()=>void work(()=>continueWith(false,'infill'))} /></View>:null}
      {draft.provider_id==='novelai' && (current.recipe.input as {model?:string}|undefined)?.model?.startsWith('nai-diffusion-5')?<TextAction label="增强画质" disabled={busy || disabled || current.state!=='AVAILABLE'} onPress={()=>void work(()=>continueWith(false,'img2img',true))} />:null}
      <View style={s.row}><ListAction label={draft.shot_id ? '用于此镜头' : '保存到相册'} secondary={!draft.shot_id} disabled={busy || disabled || current.state !== 'AVAILABLE'} onPress={() => void work(async () => {
        if (draft.shot_id && draft.project_id) {
          const shot = (await creativeService().shots(draft.project_id)).find(s => s.id === draft.shot_id);
          if (!shot) throw new Error('镜头已不存在，请返回项目检查');
          await creativeService().execute({ name: 'shot.selectOutput', payload: { id: shot.id, expectedRevision: shot.revision, slot: draft.provider_id === 'novelai' ? 'selected_image' : 'selected_video', versionId: current.id } }, createId());
          setNotice('此镜头已采用当前版本');
        } else { await exportCreativeVersion(current.id); setNotice('已加入保存队列，可在素材详情查看保存状态'); }
      })} />
      {draft.provider_id === 'novelai' ? <View style={s.row}>
        <ListAction label="制作视频" secondary disabled={busy || disabled || current.state !== 'AVAILABLE'} onPress={() => void work(() => continueWith(true))} />
      </View> : null}</View>
      <TextAction label="查看素材与版本" icon="grid_view" onPress={() => router.push({ pathname: '/creative-asset/[id]', params: { id: current.assetId, versionId: current.id, ...(draft.project_id ? {projectId:draft.project_id} : {}) } })} />
    </> : <View style={[s.card, { minHeight: 160, justifyContent: 'center', borderWidth: 0, backgroundColor: COLORS.surfaceRaised }]}><Text style={s.title}>{draft.job_id ? (needsAttention ? '本次尚无可用成果' : '创作进行中') : '从画面描述开始'}</Text><Text style={s.muted}>{draft.job_id ? (needsAttention ? '请打开本次任务查看原因与处理方式。' : '结果会显示在这里。你可以离开，回来继续查看。') : '生成后可在这里看图、修改，或继续制作视频。'}</Text></View>}
    {notice ? <Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {fullScreen && current?.relativePath ? <Modal visible animationType="fade" onRequestClose={()=>setFullScreen(false)}><SafeAreaView style={{flex:1,backgroundColor:COLORS.mediaBackground}}><View style={{alignSelf:'flex-end',paddingHorizontal:20}}><TextAction label="关闭图片预览" onPress={()=>setFullScreen(false)} /></View><Image accessibilityLabel="全屏图片" source={{uri:`${FileSystem.documentDirectory}${current.relativePath}`}} resizeMode="contain" style={{flex:1,width:'100%'}} /></SafeAreaView></Modal>:null}
  </View>;
}
