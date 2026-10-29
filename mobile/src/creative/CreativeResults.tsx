import {returnToProject} from '../navigation/creativeNavigation';
import { useResultHistory } from './useResultHistory';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useRouter } from 'expo-router';
import { getDatabase } from '../storage/databaseClient';
import { creativeService, creativeFiles, exportCreativeVersion } from './runtime';
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
import { ZoomableImage } from '../ui/ZoomableImage';
import { ImagePreview } from '../ui/ImagePreview';
import { HoldToCompare } from '../ui/HoldToCompare';
import { VersionComparison } from './VersionComparison';
import type { NovelAiDraftInput } from './novelAiProtocol';
import { ImageHistorySheet, resultImageDetails } from './ImageHistorySheet';
import { WorkbenchRegion } from './WorkbenchMotion';
import { imageWorkbenchLayout } from './imageWorkbenchLayout';

export const creativeJobLabel = (status: string) => ({ DRAFT: '准备中', VALIDATING: '检查生成条件', READY_TO_SUBMIT: '等待提交', SUBMITTING: '正在提交', QUEUED: '排队中', RUNNING: '正在生成', SUCCEEDED: '生成已完成', PARTIAL_SUCCEEDED: '部分生成完成', FAILED: '生成未完成，请查看原因', CANCELLED: '已取消', UNKNOWN: '暂时无法确认结果，请核查原任务' }[status] ?? '正在读取进度');

export function CreativeResults({ draft, host='workbench', onlyJob=false, taskDetail=false, disabled = false, dock = false, canvas=false, onCurrentVersion, onJobStatus, onEnhance, onUpscale, onReuse, onUseImage, historySignal=0, initialVersionId,previewVisible=true,relatedAssetIds,historyVisible,onHistoryVisibilityChange }: { draft: CreativeDraft; host?:'workbench'|'task'; onlyJob?:boolean; taskDetail?:boolean; disabled?: boolean; dock?:boolean; canvas?:boolean; onCurrentVersion?:(version:AssetVersion|undefined)=>void; onJobStatus?:(status:string)=>void; onEnhance?:(version:AssetVersion)=>void; onUpscale?:(version:AssetVersion)=>void; onReuse?:(patch:Partial<NovelAiDraftInput>)=>void; onUseImage?:(version:AssetVersion,action:'img2img'|'infill')=>void; historySignal?:number; initialVersionId?:string;previewVisible?:boolean;relatedAssetIds?:string[];historyVisible?:boolean;onHistoryVisibilityChange?:(visible:boolean)=>void }) {
  const router = useRouter();
  const { width,height,fontScale } = useWindowDimensions();
  const [bounds,setBounds]=useState({width,height:height*0.65});
  const layout=imageWorkbenchLayout(bounds.width,bounds.height,fontScale);

  const [selectedVersion,setSelectedVersion]=useState<AssetVersion>();
  const [sourceVersion,setSourceVersion]=useState<AssetVersion>();
  const [selected, setSelected] = useState<string|undefined>(initialVersionId);
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [readError, setReadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fullScreen,setFullScreen]=useState(false);
  const [saveRequested,setSaveRequested]=useState(false);
  const [heldOriginal,setHeldOriginal]=useState<string>();
  const [processing,setProcessing]=useState(false),[more,setMore]=useState(false),[localHistory,setLocalHistory]=useState(false);
  const history=historyVisible??localHistory;
  const previewHeight=history && !layout.sideBySide?bounds.height-layout.panelHeight:bounds.height;
  const minimalChrome=canvas && previewHeight<220;
  const setHistory=onHistoryVisibilityChange??setLocalHistory;
  const [parameters, setParameters] = useState(false);
  const [parameterDraft,setParameterDraft]=useState<CreativeDraft>();
  const [comparing,setComparing]=useState(false);
  const [historyLocked,setHistoryLocked]=useState(false);

  const [exporting,setExporting]=useState<{versionId:string;generation:number}>();
  const [delivery,setDelivery]=useState<{status:string;generation:number}>();
  const lock = useRef(false);
  const assetKey=[...new Set([...(relatedAssetIds??[]),...(draft.target_asset_id?[draft.target_asset_id]:[])])].sort().join('\n');
  useEffect(()=>{setSelected(initialVersionId);setSelectedVersion(undefined);},[draft.job_id,initialVersionId,assetKey]);
  const historyScope={assetIds:assetKey&&(!onlyJob||draft.job_id)?assetKey.split('\n'):[],jobId:onlyJob?draft.job_id??undefined:undefined};
  const paged=useResultHistory(historyScope,previewVisible,'',true,draft.job_id);
  const versions=paged.rows.filter(v=>historyScope.assetIds.includes(v.assetId)&&(!onlyJob||v.recipe.jobId===draft.job_id));
  const preferredId=selected??versions.find(v=>v.recipe.jobId===draft.job_id)?.id??versions[0]?.id;
  useFocusEffect(useCallback(() => {
    if(!previewVisible)return;
    let active=true,reading=false;
    const refresh=async()=>{
      if(!active||reading)return;reading=true;
      try{
        const job=draft.job_id?await getDatabase().getFirstAsync<{status:string}>('SELECT status FROM workflow_jobs WHERE id=?',draft.job_id):null;
        if(active){setStatus(job?.status??'');setReadError('');}
      }catch{if(active)setReadError('结果读取失败，正在重试');}finally{reading=false;}
    };
    void refresh();const timer=setInterval(()=>void refresh(),2500);
    return()=>{active=false;clearInterval(timer);};
  },[draft.job_id,previewVisible]));
  useEffect(()=>{
    if(!previewVisible)return;
    let active=true;
    if(!preferredId){setSelectedVersion(undefined);return;}
    void creativeService().versionsByIds([preferredId]).then(rows=>{
      if(active)setSelectedVersion(rows.find(v=>historyScope.assetIds.includes(v.assetId)&&(!onlyJob||v.recipe.jobId===draft.job_id)));
    }).catch(()=>{if(active)setReadError('所选结果读取失败，请重新选择');});
    return()=>{active=false;};
  },[preferredId,previewVisible,assetKey,onlyJob,draft.job_id,versions.find(v=>v.id===preferredId)?.state]);
  const current=versions.find(v=>v.id===preferredId)??(selectedVersion&&selectedVersion.id===preferredId&&historyScope.assetIds.includes(selectedVersion.assetId)&&(!onlyJob||selectedVersion.recipe.jobId===draft.job_id)?selectedVersion:undefined);
  useEffect(()=>{
    if(!previewVisible)return;
    let active=true,reading=false;setExporting(undefined);setDelivery(undefined);setNotice('');setSaveRequested(false);
    const refresh=async()=>{if(!current||reading)return;reading=true;try{
      const rows=await creativeService().deliveries(current.id);
      if(active)setDelivery(rows[0]);
    }catch{/* Retry automatic-save discovery on the next poll. */}finally{reading=false;}};
    void refresh();const timer=setInterval(()=>void refresh(),2000);
    return()=>{active=false;clearInterval(timer);};
  },[current?.id,previewVisible]);
  useEffect(()=>{onCurrentVersion?.(current);},[current?.id,current?.state,onCurrentVersion]);
  useEffect(()=>{onJobStatus?.(status);},[status,onJobStatus]);
  useEffect(()=>{if(historySignal)setHistory(true);},[historySignal]);
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
      if (video || host==='task') router.push(target); else router.replace(target);
    }
  };
  const pending = ['VALIDATING', 'READY_TO_SUBMIT', 'SUBMITTING', 'QUEUED', 'RUNNING'].includes(status);
  const needsAttention = ['FAILED', 'CANCELLED', 'UNKNOWN', 'PARTIAL_SUCCEEDED'].includes(status);
  const currentInfo=current?resultImageDetails(current):undefined;
  const dimensions=currentInfo;
  const aspect=dimensions?.width && dimensions?.height ? dimensions.width / dimensions.height : 1;
  const unavailable=busy || disabled || current?.state!=='AVAILABLE';
  const image=Boolean(current?.mime?.startsWith('image/'));
  const apply = () => void work(async () => {
    if (!current) return;
    if (draft.shot_id && draft.project_id) {
      const shot=(await creativeService().shots(draft.project_id)).find(s=>s.id===draft.shot_id);
      if(!shot)throw new Error('镜头已不存在，请返回项目检查');
      await creativeFiles().verify(current.id);
      await creativeService().execute({name:'shot.selectOutput',payload:{id:shot.id,expectedRevision:shot.revision,slot:draft.provider_id==='novelai'?'selected_image':'selected_video',versionId:current.id}},createId());
      setNotice('此镜头已采用当前版本');
    } else { await exportCreativeVersion(current.id);setExporting({versionId:current.id,generation:1});setNotice('已在素材库 · 正在存入系统相册'); }
  });
  const reuse=onReuse?((patch:Partial<NovelAiDraftInput>)=>{setMore(false);onReuse(patch);}):undefined;
  const sourceId=(current?.recipe.input as {sourceVersionId?:string}|undefined)?.sourceVersionId;
  useEffect(()=>{
    let active=true;setSourceVersion(undefined);
    if(sourceId&&previewVisible)void creativeService().versionsByIds([sourceId]).then(rows=>{if(active)setSourceVersion(rows[0]);}).catch(()=>undefined);
    return()=>{active=false;};
  },[sourceId,previewVisible]);
  const candidateOriginal=versions.find(v=>v.id===sourceId)??(sourceVersion?.id===sourceId?sourceVersion:undefined);
  const original=candidateOriginal?.state==='AVAILABLE'&&candidateOriginal.relativePath?candidateOriginal:undefined;
  const showingOriginal=Boolean(original && heldOriginal===current?.id);
  useEffect(()=>{setHeldOriginal(undefined);},[current?.id,previewVisible,fullScreen]);
  const available=versions.filter(v=>v.state==='AVAILABLE' && v.relativePath && v.mime?.startsWith('image/'));
  const currentIndex=available.findIndex(v=>v.id===current?.id);
  const [neighbors,setNeighbors]=useState<{id:string;older?:AssetVersion;newer?:AssetVersion}>();
  useEffect(()=>{
    if(!current||!image||!previewVisible)return;
    let active=true;
    const service=creativeService(),cursor={id:current.id,createdAt:current.createdAt??0};
    void Promise.all([service.resultHistoryPage({...historyScope,after:cursor,limit:1,availableOnly:true}),service.resultHistoryPage({...historyScope,before:cursor,limit:1,availableOnly:true})]).then(async([older,newer])=>{
      const rows=await service.versionsByIds([...older.ids,...newer.ids]);
      if(active)setNeighbors({id:current.id,older:rows.find(v=>v.id===older.ids[0]),newer:rows.find(v=>v.id===newer.ids[0])});
    }).catch(()=>undefined);
    return()=>{active=false;};
  },[current?.id,assetKey,onlyJob,draft.job_id,previewVisible,image]);
  const older=neighbors?.id===current?.id&&neighbors?.older?.state==='AVAILABLE'?neighbors.older:undefined;
  const newer=neighbors?.id===current?.id&&neighbors?.newer?.state==='AVAILABLE'?neighbors.newer:undefined;
  const selectNeighbor=(version:AssetVersion)=>{setSelectedVersion(version);setSelected(version.id);};
  const toggleHistoryLock=()=>setHistoryLocked(value=>!value);
  const exportHistory=async(rows:AssetVersion[])=>{
    let failed=false;
    for(const row of rows){try{await exportCreativeVersion(row.id);}catch{failed=true;}}
    if(failed)throw new Error('部分保存请求未成功');
  };
  const deliveryNotice=delivery?({QUEUED:'等待存入系统相册',PUBLISHING:'正在存入系统相册',EXPORTED:'已存入系统相册',FAILED:'存入相册失败',DELIVERY_UNKNOWN:'保存结果不确定，请先检查系统相册',QUARANTINED:'保存操作已隔离，请查看任务详情'} as Record<string,string>)[delivery.status]:undefined;
  const saveStatus=<>{deliveryNotice?<Text accessibilityLiveRegion="polite" style={s.muted}>{deliveryNotice}</Text>:notice?<Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text>:null}{image && delivery?.status==='FAILED' && current?<TextAction label="重试存入相册" disabled={busy || disabled} onPress={()=>void work(async()=>{const generation=delivery.generation+1;await exportCreativeVersion(current.id,generation);setDelivery(undefined);setExporting({versionId:current.id,generation});})} />:null}</>;
  const videoSaved=delivery?.status==='EXPORTED';
  const videoSaving=['QUEUED','PUBLISHING'].includes(delivery?.status??'');
  const saveVideo=()=>void work(async()=>{if(!current||videoSaved||videoSaving)return;const generation=delivery?.status==='FAILED'?delivery.generation+1:1;await exportCreativeVersion(current.id,generation);setDelivery({status:'QUEUED',generation});setExporting({versionId:current.id,generation});});
  const edit = draft.state==='SUBMITTED' && draft.provider_id==='novelai' && current?.recipe.input ? ()=>void work(()=>continueWith(false)) : undefined;
  const actions=current && image && draft.state==='SUBMITTED'?<ResultActionBar primaryLabel={draft.shot_id?'用于此镜头':'保存到相册'} onPrimary={apply} onEdit={edit} onProcess={image?()=>setProcessing(true):undefined} disabled={unavailable} />:null;
  const candidates=versions.slice(0,4);
  if(current && !candidates.some(v=>v.id===current.id))candidates[candidates.length-1]=current;
  const versionChoices=(rows:AssetVersion[])=>rows.map(v=><Pressable key={v.id} accessibilityRole="button" accessibilityLabel={`查看版本 ${v.versionNo}`} accessibilityState={{selected:v.id===current?.id}} onPress={()=>{setSelected(v.id);setHistory(false);}} style={{padding:4,minWidth:64,minHeight:48,borderWidth:v.id===current?.id?2:0,borderRadius:10,borderColor:COLORS.primary,gap:4}}>
    <MediaPreview version={v} kind={draft.provider_id==='novelai'?'image':'video'} label={`版本 ${v.versionNo} 预览`} style={{width:64,aspectRatio:1}} /><Text style={s.muted}>版本 {v.versionNo}</Text>{draft.provider_id!=='novelai'&&v.recipe.workflow?<Text numberOfLines={1} style={{fontSize:11,color:COLORS.textMuted,maxWidth:150}}>{String((v.recipe.workflow as {title?:string}).title??'')}</Text>:null}
  </Pressable>);
  const content=<View style={{gap:12}}>
    {draft.job_id && !taskDetail?<View style={[s.row,{paddingVertical:4}]}><View style={{flexDirection:'row',alignItems:'center',gap:8,flex:1}}>{pending?<ActivityIndicator size="small" />:null}<Text accessibilityLiveRegion="polite" style={needsAttention?s.error:s.muted}>{creativeJobLabel(status)}</Text></View><TextAction label={status==='UNKNOWN'?'核查原任务':'查看本次任务'} onPress={()=>router.push({pathname:'/creative-task/[id]',params:{id:draft.job_id!,returnToWorkbench:'1'}})} /></View>:null}
    {current?<>
      <View style={s.row}><SectionHeading title={draft.state==='EDITING'?'参考结果':'创作结果'} detail={`版本 ${current.versionNo}`} /><View style={{flexDirection:'row',gap:12}}>
        {!image&&!onlyJob?<><IconAction label={videoSaved?'已保存到系统相册':videoSaving?'正在保存到系统相册':delivery?.status==='FAILED'?'重试保存到系统相册':'保存视频到系统相册'} icon={videoSaved?'check':'download'} selected={videoSaved} disabled={unavailable||videoSaved||videoSaving} onPress={saveVideo}/>{draft.shot_id?<TextAction label="用于此镜头" onPress={apply} disabled={unavailable}/>:null}</>:null}
        {image?<><IconAction label="保存图片到系统相册" icon="download" disabled={unavailable} onPress={()=>void work(async()=>{setSaveRequested(true);await exportCreativeVersion(current.id);setExporting({versionId:current.id,generation:1});})}/><ImageMetadataPanel key={current.id} version={current} label="信息" onReuse={reuse} /></>:null}
        {draft.state==='SUBMITTED'?<IconAction label="更多成果操作" icon="more_horiz" onPress={()=>setMore(true)} />:null}
      </View></View>
      {current.state==='AVAILABLE' && current.relativePath?current.mime?.startsWith('video/')?<View testID="result-video-stage" style={{height:Math.min(420,Math.max(220,(width-32)/aspect)),width:'100%',borderRadius:12,overflow:'hidden'}}><VideoPlayer source={`${FileSystem.documentDirectory}${current.relativePath}`} /></View>:<Pressable accessibilityRole="button" accessibilityLabel="全屏查看图片" onPress={()=>setFullScreen(true)}><Image accessibilityLabel={`当前图片，版本 ${current.versionNo}`} source={{uri:`${FileSystem.documentDirectory}${current.relativePath}`}} resizeMode="contain" style={{width:'100%',height:Math.min(taskDetail?300:dock?400:640,Math.max(200,(width-32)/aspect)),borderRadius:16,backgroundColor:COLORS.mediaBackground}} /></Pressable>:<Text style={s.muted}>原文件尚不可用，请在素材详情中恢复。</Text>}
      {!onlyJob&&dimensions?.width?<Text style={s.muted}>{dimensions.width} × {dimensions.height}{draft.job_id && current.recipe.jobId!==draft.job_id?' · 历史结果':''}</Text>:null}
      {versions.length>1?<View style={s.row}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{versionChoices(candidates)}</ScrollView><TextAction label={`版本历史 · ${versions.length}${paged.next?'+':''}`} onPress={()=>setHistory(true)} /></View>:null}
    </>:<View style={[s.card,{minHeight:160,justifyContent:'center',borderWidth:0}]}><Text style={s.title}>{draft.job_id?(needsAttention?'本次尚无可用成果':'创作进行中'):'从画面描述开始'}</Text><Text style={s.muted}>{draft.job_id?'结果会显示在这里，你可以离开后再回来。':'生成后可在这里看图和继续创作。'}</Text><TextAction label="任务与草稿操作" onPress={()=>setMore(true)} /></View>}
    {saveStatus}
    {notice==='此镜头已采用当前版本'&&draft.project_id?<TextAction label="返回此镜头" onPress={()=>void work(()=>returnToProject(router,{projectId:draft.project_id!,shotId:draft.shot_id!}))}/>:null}
    {error || readError || paged.error?<Text accessibilityRole="alert" style={s.error}>{error || readError || paged.error}</Text>:null}
  </View>;
  const canvasContent=<View style={{flex:1,minHeight:0,minWidth:0,paddingHorizontal:8}}>

    {current?<>{!minimalChrome?<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{fontSize:11,color:COLORS.textMuted,flex:1}}>{dimensions?.width?`${dimensions.width} × ${dimensions.height} · `:''}v{current.versionNo}{!image&&current.recipe.workflow?` · ${String((current.recipe.workflow as {title?:string;id?:string}).title??(current.recipe.workflow as {id?:string}).id??'')}`:''}{current.recipe.jobId!==draft.job_id?' · 历史结果':''}</Text><View style={{flexDirection:'row'}}>
      {<IconAction label={delivery?.status==='EXPORTED'?'已保存到系统相册':'保存图片到系统相册'} icon="download" selected={delivery?.status==='EXPORTED'} disabled={unavailable} onPress={()=>void work(async()=>{setSaveRequested(true);await exportCreativeVersion(current.id);setExporting({versionId:current.id,generation:1});})} />}
      {onEnhance?<IconAction label="增强图片" icon="auto_awesome" disabled={unavailable} onPress={()=>onEnhance(current)} />:null}
      {onUpscale?<IconAction label="清晰放大 2×" icon="open_in_full" disabled={unavailable} onPress={()=>onUpscale(current)} />:null}
      {draft.shot_id?<IconAction label="用于此镜头" icon="image" disabled={unavailable} onPress={apply} />:null}
      <IconAction label="更多成果操作" icon="filter_list" onPress={()=>setMore(true)} />
    </View></View>:null}
    {current.state==='AVAILABLE' && current.relativePath?image?<View testID="result-image-stage" style={{flex:1,minHeight:0,marginVertical:6,borderRadius:12,overflow:'hidden',backgroundColor:COLORS.surfaceRaised}}><ZoomableImage uri={`${FileSystem.documentDirectory}${current.relativePath}`} identity={current.id} label={`当前图片，版本 ${current.versionNo}`} onOpen={()=>setFullScreen(true)} originalUri={original?`${FileSystem.documentDirectory}${original.relativePath}`:undefined} showOriginal={showingOriginal}/>{original?<View testID="result-compare-overlay" style={{position:'absolute',right:10,bottom:10}}><HoldToCompare active={showingOriginal} onChange={held=>setHeldOriginal(held?current.id:undefined)} /></View>:null}</View>:<View style={{flex:1,minHeight:180}}><VideoPlayer source={`${FileSystem.documentDirectory}${current.relativePath}`} /></View>:<Text style={s.muted}>原文件尚不可用，请在素材详情中恢复。</Text>}
    {image && !minimalChrome?<View style={{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap',paddingVertical:4}}>
      <Text selectable style={{fontSize:12,color:COLORS.textMuted,flex:1}}>Seed {currentInfo?.seed??'未记录'}</Text>
      {onReuse && currentInfo?.seed!==undefined?<TextAction label="复用 Seed" disabled={busy || disabled} onPress={()=>onReuse({seed:currentInfo.seed})} />:null}
      <Text style={{fontSize:12,color:COLORS.textMuted}}>{available.length?`已载入 ${available.length}${paged.next?'+':''} 张`:''}</Text>
      <IconAction label="上一张结果" icon="arrow_back" disabled={!older} onPress={()=>older&&selectNeighbor(older)} />
      <IconAction label="下一张结果" icon="chevron_right" disabled={!newer} onPress={()=>newer&&selectNeighbor(newer)} />
    </View>:null}
    {image && !minimalChrome && !history && versions.length>1?<View style={{height:54}}><FlatList horizontal data={versions} keyExtractor={v=>v.id} onEndReached={paged.next?paged.loadMore:undefined} onEndReachedThreshold={0.5} windowSize={5} showsHorizontalScrollIndicator={false} initialNumToRender={8} contentContainerStyle={{gap:6}} renderItem={({item:v})=><Pressable accessibilityRole="button" accessibilityLabel={`预览历史版本 ${v.versionNo}`} accessibilityState={{selected:v.id===current?.id}} onPress={()=>setSelected(v.id)} style={{width:48,padding:2,borderWidth:2,borderRadius:6,borderColor:v.id===current?.id?COLORS.primary:'transparent'}}><MediaPreview version={v} kind="image" label={`历史缩略图 ${v.versionNo}`} style={{width:40,height:36,aspectRatio:undefined}} /><Text style={{fontSize:10,color:COLORS.textMuted,textAlign:'center'}}>v{v.versionNo}</Text></Pressable>} /></View>:null}

    </>:<View style={{flex:1,alignItems:'center',justifyContent:'center',gap:6}}><Text style={{fontSize:15,color:COLORS.textMuted}}>{draft.job_id?(status==='UNKNOWN'?'结果待核查':status==='FAILED'?'本次生成未完成':status==='CANCELLED'?'本次生成已取消':'正在等待结果'):'写下描述，开始创作'}</Text></View>}
    {error || readError || paged.error?<Text accessibilityRole="alert" style={s.error}>{error || readError || paged.error}</Text>:null}
  </View>;
  if(!previewVisible)return null;
  return <View style={dock || canvas?{flex:1}:{gap:12}}>
    {canvas && (saveRequested&&deliveryNotice||notice)?<View style={{position:'absolute',bottom:8,left:12,right:12,zIndex:10,padding:8,borderRadius:10,backgroundColor:COLORS.surfaceRaised}}>{saveStatus}<TextAction label="关闭保存提示" onPress={()=>{setSaveRequested(false);setNotice('');}}/></View>:null}
    {canvas?<View onLayout={event=>setBounds(event.nativeEvent.layout)} style={{flex:1,minHeight:0,flexDirection:layout.sideBySide?'row':'column'}}>{canvasContent}<WorkbenchRegion visible={history && draft.provider_id==='novelai'} size={layout.sideBySide?layout.panelWidth:layout.panelHeight} horizontal={layout.sideBySide} testID="inline-image-history" style={{borderRadius:14,borderWidth:0.5,borderColor:COLORS.border,backgroundColor:COLORS.surface}}><ImageHistorySheet source={history?historyScope:undefined} inline rail={layout.sideBySide} versions={versions} selectedId={current?.id} locked={historyLocked} onLock={toggleHistoryLock} onSelect={version=>{setSelectedVersion(version);setSelected(version.id);}} onExport={exportHistory} onClose={()=>setHistory(false)} /></WorkbenchRegion></View>:dock?<ScrollView contentContainerStyle={{padding:16,gap:12}}>{content}</ScrollView>:content}
    {!canvas?actions:null}
    {processing && current?<ImageProcessingSheet version={current} projectId={draft.project_id??undefined} shotId={draft.shot_id??undefined} replace={host==='workbench'} onClose={()=>setProcessing(false)} />:null}
    {more?<ParameterSheet title="成果操作" onClose={()=>setMore(false)}>
      {canvas && current && image?<ImageMetadataPanel key={current.id} version={current} label="图片信息" onReuse={reuse} />:null}
      {draft.provider_id==='autodl'&&onlyJob?<><TextAction label={videoSaved?'已保存到系统相册':videoSaving?'正在保存到系统相册':'保存视频到系统相册'} disabled={!current||unavailable||videoSaved||videoSaving} onPress={()=>{setMore(false);saveVideo();}}/>{draft.shot_id?<TextAction label="用于此镜头" disabled={unavailable} onPress={apply}/>:null}<TextAction label="查看本轮任务" onPress={()=>{setMore(false);router.push({pathname:'/creative-task/[id]',params:{id:draft.job_id!,returnToWorkbench:'1'}});}}/></>:null}
      {versions.length>1?<TextAction label="比较版本与参数" onPress={()=>{setMore(false);setComparing(true);}} />:null}
      {canvas && versions.length>1?<TextAction label={`版本历史 · ${versions.length}${paged.next?'+':''}`} onPress={()=>{setMore(false);setHistory(true);}} />:null}
      {current && draft.provider_id==='novelai'?<><TextAction label="以此图生成" disabled={unavailable} onPress={()=>{setMore(false);if(onUseImage)onUseImage(current,'img2img');else void work(()=>continueWith(false,'img2img'));}} /><TextAction label="局部重绘" disabled={unavailable} onPress={()=>{setMore(false);if(onUseImage)onUseImage(current,'infill');else void work(()=>continueWith(false,'infill'));}} /><TextAction label="制作视频" disabled={unavailable} onPress={()=>{setMore(false);void work(()=>continueWith(true));}} /></>:null}
      {current?<TextAction label="查看素材与版本" onPress={()=>{setMore(false);router.push({pathname:'/creative-asset/[id]',params:{id:current.assetId,versionId:current.id,...(draft.project_id?{projectId:draft.project_id}:{})}});}} />:null}
      <TextAction label={current?.recipe.jobId&&current.recipe.jobId!==draft.job_id?'此版本生成参数':'本次生成参数'} onPress={()=>void work(async()=>{const selectedDraft=current?.recipe.jobId&&current.recipe.jobId!==draft.job_id?(await creativeService().drafts(draft.project_id??undefined)).find(row=>row.job_id===current.recipe.jobId):draft;if(!selectedDraft)throw new Error('该版本草稿已不可用，可在素材详情查看参数');setParameterDraft(selectedDraft);setMore(false);setParameters(true);})} />
      {draft.state==='SUBMITTED'?<CopySubmittedDraft id={draft.id} />:null}
    </ParameterSheet>:null}
    {parameters?<DraftParametersSheet draft={parameterDraft??draft} onClose={()=>setParameters(false)} />:null}
    {history && !(canvas && draft.provider_id==='novelai')?draft.provider_id==='novelai'?<ImageHistorySheet source={historyScope} versions={versions} selectedId={current?.id} locked={historyLocked} onLock={toggleHistoryLock} onSelect={version=>{setSelectedVersion(version);setSelected(version.id);}} onExport={exportHistory} onClose={()=>setHistory(false)} />:<ParameterSheet fullScreen={!canvas} title="版本历史" description="选择仅改变预览，不改变项目采用" onClose={()=>setHistory(false)}><FlatList horizontal data={versions} keyExtractor={v=>v.id} initialNumToRender={8} windowSize={5} onEndReached={paged.next?paged.loadMore:undefined} renderItem={({item})=><>{versionChoices([item])}</>} ListFooterComponent={paged.next?<TextAction label="加载更早结果" disabled={paged.loading} onPress={paged.loadMore}/>:null}/></ParameterSheet>:null}
    {comparing?<ParameterSheet fullScreen title="版本对照" onClose={()=>setComparing(false)}><VersionComparison versions={versions} onLoadMore={paged.next?paged.loadMore:undefined} loading={paged.loading} /></ParameterSheet>:null}
    {fullScreen && current?.relativePath?<ImagePreview imageKey={current.id} uri={`${FileSystem.documentDirectory}${current.relativePath}`} title={`版本 ${current.versionNo}`} previousUri={older?.relativePath?`${FileSystem.documentDirectory}${older.relativePath}`:undefined} nextUri={newer?.relativePath?`${FileSystem.documentDirectory}${newer.relativePath}`:undefined} onClose={()=>setFullScreen(false)} comparison={original?{uri:`${FileSystem.documentDirectory}${original.relativePath}`,label:`原图 · v${original.versionNo}`}:undefined} onPrevious={older?()=>selectNeighbor(older):undefined} onNext={newer?()=>selectNeighbor(newer):undefined} />:null}
  </View>;
}
