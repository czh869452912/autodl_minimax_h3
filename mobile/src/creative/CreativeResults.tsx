import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
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
import { IconAction, ParameterSheet, SectionHeading, TextAction } from './WorkbenchUI';
import { MediaPreview } from './MediaPreview';
import { defaultNovelAiDraft, novelAiDraftInput } from './novelAiProtocol';
import {ImageMetadataPanel} from './ImageMetadataPanel';
import { ImageProcessingSheet } from './ImageProcessingSheet';
import { ResultActionBar } from './ResultActionBar';
import { CopySubmittedDraft } from './CopySubmittedDraft';
import { DraftParametersSheet } from './DraftParametersSheet';
import { ImagePreview } from '../ui/ImagePreview';
import { VersionComparison } from './VersionComparison';
import type { NovelAiDraftInput } from './novelAiProtocol';

export const creativeJobLabel = (status: string) => ({ DRAFT: '准备中', VALIDATING: '检查生成条件', READY_TO_SUBMIT: '等待提交', SUBMITTING: '正在提交', QUEUED: '排队中', RUNNING: '正在生成', SUCCEEDED: '生成已完成', PARTIAL_SUCCEEDED: '部分生成完成', FAILED: '生成未完成，请查看原因', CANCELLED: '已取消', UNKNOWN: '暂时无法确认结果，请核查原任务' }[status] ?? '正在读取进度');

export function CreativeResults({ draft, disabled = false, dock = false, canvas=false, onCurrentVersion, onJobStatus, onEnhance, onUpscale, onReuse, onUseImage, historySignal=0, initialVersionId,previewVisible=true,relatedAssetIds }: { draft: CreativeDraft; disabled?: boolean; dock?:boolean; canvas?:boolean; onCurrentVersion?:(version:AssetVersion|undefined)=>void; onJobStatus?:(status:string)=>void; onEnhance?:(version:AssetVersion)=>void; onUpscale?:(version:AssetVersion)=>void; onReuse?:(patch:Partial<NovelAiDraftInput>)=>void; onUseImage?:(version:AssetVersion,action:'img2img'|'infill')=>void; historySignal?:number; initialVersionId?:string;previewVisible?:boolean;relatedAssetIds?:string[] }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [selected, setSelected] = useState<string|undefined>(initialVersionId);
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fullScreen,setFullScreen]=useState(false);
  const [processing,setProcessing]=useState(false),[more,setMore]=useState(false),[history,setHistory]=useState(false);
  const [parameters, setParameters] = useState(false);
  const [parameterDraft,setParameterDraft]=useState<CreativeDraft>();
  const [comparing,setComparing]=useState(false);
  const [exporting,setExporting]=useState<{versionId:string;generation:number}>();
  const [delivery,setDelivery]=useState<{status:string;generation:number}>();
  const lock = useRef(false);
  const assetKey=[...new Set([...(relatedAssetIds??[]),...(draft.target_asset_id?[draft.target_asset_id]:[])])].sort().join('\n');
  useEffect(()=>{setSelected(initialVersionId);},[draft.job_id]);
  useFocusEffect(useCallback(() => {
    let active = true;
    setStatus('');
    const refresh = async () => {
      const rows = assetKey?(await Promise.all(assetKey.split('\n').map(id=>creativeService().versions(id)))).flat().sort((a,b)=>b.versionNo-a.versionNo):[];
      const job = draft.job_id ? await getDatabase().getFirstAsync<{ status: string }>('SELECT status FROM workflow_jobs WHERE id=?', draft.job_id) : null;
      if (active) { setVersions(rows); setStatus(job?.status ?? ''); }
    };
    void refresh().catch(() => { if (active) setError('结果读取失败，请稍后重新打开'); });
    const timer = setInterval(() => void refresh().catch(() => undefined), 2500);
    return () => { active = false; clearInterval(timer); };
  }, [draft.id, draft.target_asset_id, draft.job_id,assetKey]));
  const current = versions.find(v => v.id === selected) ?? versions.find(v => v.recipe.jobId === draft.job_id) ?? versions[0];
  useEffect(()=>{onCurrentVersion?.(current);},[current?.id,current?.state,onCurrentVersion]);
  useEffect(()=>{onJobStatus?.(status);},[status,onJobStatus]);
  useEffect(()=>{if(historySignal)setHistory(true);},[historySignal]);
  useEffect(()=>{
    if(!exporting)return;
    let active=true;
    const refresh=async()=>{const rows=await creativeService().deliveries(exporting.versionId);if(active){setDelivery(rows[0]);if(rows[0] && ['EXPORTED','FAILED','DELIVERY_UNKNOWN','QUARANTINED'].includes(rows[0].status))clearInterval(timer);}};
    const timer=setInterval(()=>void refresh().catch(()=>{if(active)setError('保存状态读取失败，可重新查看');}),2000);
    void refresh().catch(()=>{if(active)setError('保存状态读取失败，可重新查看');});
    return()=>{active=false;clearInterval(timer);};
  },[exporting]);
  const work = async (fn: () => Promise<unknown>) => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  const continueWith = async (video: boolean, action?: 'img2img'|'infill') => {
    if (!current) return;
    const parsed=novelAiDraftInput.safeParse(current.recipe.input), recipe=parsed.success?parsed.data:defaultNovelAiDraft;
    const result = await creativeService().execute(video
      ? { name: 'draft.createVideo', payload: { versionId: current.id, projectId: draft.project_id ?? undefined, shotId: draft.shot_id ?? undefined } }
      : { name: 'draft.createImage', payload: { fromVersionId: current.id, projectId: draft.project_id ?? undefined, shotId: draft.shot_id ?? undefined, ...(action ? {input:{...recipe,action,enhance:false,enhancement:null,sourceVersionId:current.id,maskVersionId:null,maskStrokes:[]}} : recipe.enhancement || recipe.enhance ? {input:{...recipe,action:'generate',enhance:false,enhancement:null,sourceVersionId:null,maskVersionId:null,maskStrokes:[]}} : {}) } }, createId());
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
  const unavailable=busy || disabled || current?.state!=='AVAILABLE';
  const image=Boolean(current?.mime?.startsWith('image/'));
  const apply = () => void work(async () => {
    if (!current) return;
    if (draft.shot_id && draft.project_id) {
      const shot=(await creativeService().shots(draft.project_id)).find(s=>s.id===draft.shot_id);
      if(!shot)throw new Error('镜头已不存在，请返回项目检查');
      await creativeService().execute({name:'shot.selectOutput',payload:{id:shot.id,expectedRevision:shot.revision,slot:draft.provider_id==='novelai'?'selected_image':'selected_video',versionId:current.id}},createId());
      setNotice('此镜头已采用当前版本');
    } else { await exportCreativeVersion(current.id);setExporting({versionId:current.id,generation:1});setNotice('已在素材库 · 正在存入系统相册'); }
  });
  const reuse=onReuse?((patch:Partial<NovelAiDraftInput>)=>{setMore(false);onReuse(patch);}):undefined;
  const sourceId=(current?.recipe.input as {sourceVersionId?:string}|undefined)?.sourceVersionId;
  const original=versions.find(v=>v.id===sourceId && v.state==='AVAILABLE' && v.relativePath);
  const available=versions.filter(v=>v.state==='AVAILABLE' && v.relativePath && v.mime?.startsWith('image/'));
  const currentIndex=available.findIndex(v=>v.id===current?.id);
  const deliveryNotice=exporting && delivery?({QUEUED:'等待存入系统相册',PUBLISHING:'正在存入系统相册',EXPORTED:'已存入系统相册',FAILED:'存入相册失败',DELIVERY_UNKNOWN:'保存结果不确定，请先检查系统相册',QUARANTINED:'保存操作已隔离，请查看任务详情'} as Record<string,string>)[delivery.status]:undefined;
  const saveStatus=<>{deliveryNotice?<Text accessibilityLiveRegion="polite" style={s.muted}>{deliveryNotice}</Text>:notice?<Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text>:null}{delivery?.status==='FAILED' && exporting?<TextAction label="重试存入相册" disabled={busy || disabled} onPress={()=>void work(async()=>{const generation=delivery.generation+1;await exportCreativeVersion(exporting.versionId,generation);setDelivery(undefined);setExporting({versionId:exporting.versionId,generation});})} />:null}</>;
  const edit = draft.state==='SUBMITTED' && draft.provider_id==='novelai' && current?.recipe.input ? ()=>void work(()=>continueWith(false)) : undefined;
  const actions=current && draft.state==='SUBMITTED'?<ResultActionBar primaryLabel={draft.shot_id?'用于此镜头':'保存到相册'} onPrimary={apply} onEdit={edit} onProcess={image?()=>setProcessing(true):undefined} disabled={unavailable} />:null;
  const candidates=versions.slice(0,4);
  if(current && !candidates.some(v=>v.id===current.id))candidates[candidates.length-1]=current;
  const versionChoices=(rows:AssetVersion[])=>rows.map(v=><Pressable key={v.id} accessibilityRole="button" accessibilityLabel={`查看版本 ${v.versionNo}`} accessibilityState={{selected:v.id===current?.id}} onPress={()=>{setSelected(v.id);setHistory(false);}} style={{padding:4,minWidth:64,minHeight:48,borderWidth:v.id===current?.id?2:0,borderRadius:10,borderColor:COLORS.primary,gap:4}}>
    <MediaPreview version={v} kind={draft.provider_id==='novelai'?'image':'video'} label={`版本 ${v.versionNo} 预览`} style={{width:64,aspectRatio:1}} /><Text style={s.muted}>版本 {v.versionNo}</Text>{draft.provider_id!=='novelai'&&v.recipe.workflow?<Text numberOfLines={1} style={{fontSize:11,color:COLORS.textMuted,maxWidth:150}}>{String((v.recipe.workflow as {title?:string}).title??'')}</Text>:null}
  </Pressable>);
  const content=<View style={{gap:12}}>
    {draft.job_id?<View style={[s.row,{paddingVertical:4}]}><View style={{flexDirection:'row',alignItems:'center',gap:8,flex:1}}>{pending?<ActivityIndicator size="small" />:null}<Text accessibilityLiveRegion="polite" style={needsAttention?s.error:s.muted}>{creativeJobLabel(status)}</Text></View><TextAction label={status==='UNKNOWN'?'核查原任务':'查看本次任务'} onPress={()=>router.push({pathname:'/creative-task/[id]',params:{id:draft.job_id!,returnToWorkbench:'1'}})} /></View>:null}
    {current?<>
      <View style={s.row}><SectionHeading title={draft.state==='EDITING'?'参考结果':'创作结果'} detail={`版本 ${current.versionNo}`} /><View style={{flexDirection:'row',gap:12}}>
        {image?<ImageMetadataPanel key={current.id} version={current} label="信息" onReuse={reuse} />:null}
        {draft.state==='SUBMITTED'?<TextAction label="更多成果操作" onPress={()=>setMore(true)} />:null}
      </View></View>
      {current.state==='AVAILABLE' && current.relativePath?current.mime?.startsWith('video/')?<VideoPlayer source={`${FileSystem.documentDirectory}${current.relativePath}`} />:<Pressable accessibilityRole="button" accessibilityLabel="全屏查看图片" onPress={()=>setFullScreen(true)}><Image accessibilityLabel={`当前图片，版本 ${current.versionNo}`} source={{uri:`${FileSystem.documentDirectory}${current.relativePath}`}} resizeMode="contain" style={{width:'100%',height:Math.min(dock?400:640,Math.max(200,(width-32)/aspect)),borderRadius:16,backgroundColor:COLORS.mediaBackground}} /></Pressable>:<Text style={s.muted}>原文件尚不可用，请在素材详情中恢复。</Text>}
      {dimensions?.width?<Text style={s.muted}>{dimensions.width} × {dimensions.height}{draft.job_id && current.recipe.jobId!==draft.job_id?' · 历史结果':''}</Text>:null}
      {versions.length>1?<View style={s.row}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{versionChoices(candidates)}</ScrollView><TextAction label={`版本历史 · ${versions.length}`} onPress={()=>setHistory(true)} /></View>:null}
    </>:<View style={[s.card,{minHeight:160,justifyContent:'center',borderWidth:0}]}><Text style={s.title}>{draft.job_id?(needsAttention?'本次尚无可用成果':'创作进行中'):'从画面描述开始'}</Text><Text style={s.muted}>{draft.job_id?'结果会显示在这里，你可以离开后再回来。':'生成后可在这里看图和继续创作。'}</Text><TextAction label="任务与草稿操作" onPress={()=>setMore(true)} /></View>}
    {saveStatus}
    {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  </View>;
  const canvasContent=<View style={{flex:1,paddingHorizontal:12}}>
    {draft.job_id && (pending || needsAttention || !current)?<View style={s.row}><Text accessibilityLiveRegion="polite" style={[needsAttention?s.error:s.muted,{fontSize:12}]}>{creativeJobLabel(status)}</Text><TextAction label={status==='UNKNOWN'?'核查原任务':'查看本次任务'} onPress={()=>router.push({pathname:'/creative-task/[id]',params:{id:draft.job_id!,returnToWorkbench:'1'}})} /></View>:null}
    {current?<><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{fontSize:11,color:COLORS.textMuted,flex:1}}>{dimensions?.width?`${dimensions.width} × ${dimensions.height} · `:''}v{current.versionNo}{!image&&current.recipe.workflow?` · ${String((current.recipe.workflow as {title?:string;id?:string}).title??(current.recipe.workflow as {id?:string}).id??'')}`:''}{current.recipe.jobId!==draft.job_id?' · 历史结果':''}</Text><View style={{flexDirection:'row'}}>
      {onEnhance?<IconAction label="增强图片" icon="auto_awesome" disabled={unavailable} onPress={()=>onEnhance(current)} />:null}
      {onUpscale?<IconAction label="清晰放大 2×" icon="open_in_full" disabled={unavailable} onPress={()=>onUpscale(current)} />:null}
      <IconAction label={draft.shot_id?'用于此镜头':'保存到相册'} icon={draft.shot_id?'image':'download'} disabled={unavailable} onPress={apply} />
      <IconAction label="更多成果操作" icon="filter_list" onPress={()=>setMore(true)} />
    </View></View>
    {current.state==='AVAILABLE' && current.relativePath?image?<Pressable accessibilityRole="button" accessibilityLabel="全屏查看图片" onPress={()=>setFullScreen(true)} style={{flex:1,minHeight:120}}><Image accessibilityLabel={`当前图片，版本 ${current.versionNo}`} source={{uri:`${FileSystem.documentDirectory}${current.relativePath}`}} resizeMode="contain" style={{flex:1,width:'100%'}} /></Pressable>:<View style={{flex:1,minHeight:180}}><VideoPlayer source={`${FileSystem.documentDirectory}${current.relativePath}`} /></View>:<Text style={s.muted}>原文件尚不可用，请在素材详情中恢复。</Text>}
    {original?<TextAction label="对照原图与结果" onPress={()=>setFullScreen(true)} />:null}
    </>:<View style={{flex:1,alignItems:'center',justifyContent:'center',gap:6}}><Text style={{fontSize:15,color:COLORS.textMuted}}>{draft.job_id?'正在等待结果':'写下描述，开始创作'}</Text></View>}
    {saveStatus}{error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  </View>;
  if(!previewVisible)return null;
  return <View style={dock || canvas?{flex:1}:{gap:12}}>
    {canvas?canvasContent:dock?<ScrollView contentContainerStyle={{padding:16,gap:12}}>{content}</ScrollView>:content}
    {!canvas?actions:null}
    {processing && current?<ImageProcessingSheet version={current} projectId={draft.project_id??undefined} shotId={draft.shot_id??undefined} replace onClose={()=>setProcessing(false)} />:null}
    {more?<ParameterSheet title="成果操作" onClose={()=>setMore(false)}>
      {canvas && current && image?<ImageMetadataPanel key={current.id} version={current} label="图片信息" onReuse={reuse} />:null}
      {versions.length>1?<TextAction label="比较版本与参数" onPress={()=>{setMore(false);setComparing(true);}} />:null}
      {canvas && versions.length>1?<TextAction label={`版本历史 · ${versions.length}`} onPress={()=>{setMore(false);setHistory(true);}} />:null}
      {current && draft.provider_id==='novelai'?<><TextAction label="以此图生成" disabled={unavailable} onPress={()=>{setMore(false);if(onUseImage)onUseImage(current,'img2img');else void work(()=>continueWith(false,'img2img'));}} /><TextAction label="局部重绘" disabled={unavailable} onPress={()=>{setMore(false);if(onUseImage)onUseImage(current,'infill');else void work(()=>continueWith(false,'infill'));}} /><TextAction label="制作视频" disabled={unavailable} onPress={()=>{setMore(false);void work(()=>continueWith(true));}} /></>:null}
      {current?<TextAction label="查看素材与版本" onPress={()=>{setMore(false);router.push({pathname:'/creative-asset/[id]',params:{id:current.assetId,versionId:current.id,...(draft.project_id?{projectId:draft.project_id}:{})}});}} />:null}
      <TextAction label={current?.recipe.jobId&&current.recipe.jobId!==draft.job_id?'此版本生成参数':'本次生成参数'} onPress={()=>void work(async()=>{const selectedDraft=current?.recipe.jobId&&current.recipe.jobId!==draft.job_id?(await creativeService().drafts(draft.project_id??undefined)).find(row=>row.job_id===current.recipe.jobId):draft;if(!selectedDraft)throw new Error('该版本草稿已不可用，可在素材详情查看参数');setParameterDraft(selectedDraft);setMore(false);setParameters(true);})} />
      {draft.state==='SUBMITTED'?<CopySubmittedDraft id={draft.id} />:null}
    </ParameterSheet>:null}
    {parameters?<DraftParametersSheet draft={parameterDraft??draft} onClose={()=>setParameters(false)} />:null}
    {history?<ParameterSheet fullScreen={!canvas} title="版本历史" description="选择仅改变预览，不改变项目采用" onClose={()=>setHistory(false)}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:10}}>{versionChoices(versions)}</ScrollView></ParameterSheet>:null}
    {comparing?<ParameterSheet fullScreen title="版本对照" onClose={()=>setComparing(false)}><VersionComparison versions={versions} /></ParameterSheet>:null}
    {fullScreen && current?.relativePath?<ImagePreview uri={`${FileSystem.documentDirectory}${current.relativePath}`} title={`版本 ${current.versionNo}`} onClose={()=>setFullScreen(false)} comparison={original?{uri:`${FileSystem.documentDirectory}${original.relativePath}`,label:`原图 · v${original.versionNo}`}:undefined} onPrevious={currentIndex>=0 && currentIndex<available.length-1?()=>setSelected(available[currentIndex+1].id):undefined} onNext={currentIndex>0?()=>setSelected(available[currentIndex-1].id):undefined} />:null}
  </View>;
}
