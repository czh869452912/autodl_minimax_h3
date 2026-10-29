import {useFallbackBack} from '../navigation/useFallbackBack';
import {useCallback,useRef,useState} from 'react';
import {Text,View,ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect,useRouter} from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import {creativeService,creativeFiles} from './runtime';
import type {CreativeShot} from './story';
import type {CreativeDraft} from './drafts';
import type {AssetVersion} from './types';
import {createId} from '../ids';
import {returnToProject} from '../navigation/creativeNavigation';
import {CompactWorkbench,IconAction,TextAction} from './WorkbenchUI';
import {MediaPreview} from './MediaPreview';
import {VideoPlayer} from '../media/VideoPlayer';
import {creativeUI as s} from './creativeUI';

type Review={shot:CreativeShot;drafts:CreativeDraft[];versions:AssetVersion[];archived:boolean};
export function ShotOutputReview({projectId,shotId}:{projectId:string;shotId:string}){
 const router=useRouter(),lock=useRef(false);
 const [review,setReview]=useState<Review>(),[selected,setSelected]=useState<string>(),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  const service=creativeService();
  const [project,shots,allDrafts]=await Promise.all([service.project(projectId),service.shots(projectId),service.drafts(projectId)]);
  const shot=shots.find(row=>row.id===shotId);
  if(!project||!shot)throw new Error('原镜头或项目已不可用，请返回项目列表检查');
  const drafts=allDrafts.filter(row=>row.shot_id===shotId&&row.provider_id==='autodl'&&row.state!=='DISCARDED');
  const assets=[...new Set(drafts.map(d=>d.target_asset_id).filter((id):id is string=>!!id))];
  const versions=(await Promise.all(assets.map(id=>service.versions(id)))).flat().filter(v=>v.mime?.startsWith('video/')&&drafts.some(d=>d.job_id&&d.job_id===v.recipe.jobId));
  if(shot.selected_video&&!versions.some(v=>v.id===shot.selected_video))versions.unshift(...await service.versionsByIds([shot.selected_video]));
  return {shot,drafts,versions,archived:!!project.archivedAt};
 },[projectId,shotId]);
 useFocusEffect(useCallback(()=>{let live=true;void load().then(value=>{if(live){setReview(value);setError('');}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[load]));
 const target=selected??review?.shot.selected_video??undefined;
 const version=review?.versions.find(v=>v.id===target);
 const back=()=>router.canGoBack()?router.back():void returnToProject(router,{projectId,shotId}).catch(()=>setError('项目读取失败'));
 useFallbackBack(back);
 const apply=async()=>{
  if(lock.current||!review||!version||review.archived)return;
  lock.current=true;setBusy(true);setError('');
  try{
   await creativeFiles().verify(version.id);
   const result=await creativeService().execute({name:'shot.selectOutput',payload:{id:shotId,expectedRevision:review.shot.revision,slot:'selected_video',versionId:version.id}},createId());
   if(result.status!=='completed')throw new Error('采用尚未完成，请重试');
   setReview(await load());setNotice('此镜头已采用当前固定版本');
  }catch(e){setError(e instanceof Error?e.message:'采用失败');}finally{lock.current=false;setBusy(false);}
 };
 return <CompactWorkbench><SafeAreaView style={s.screen}>
  <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:8}}><IconAction label="返回" icon="arrow_back" disabled={busy} onPress={back}/><Text style={[s.title,{flex:1}]}>镜头成果审阅</Text></View>
  <ScrollView contentContainerStyle={s.content}>
   {review?<><Text style={s.title}>{review.shot.title}</Text><Text style={s.muted}>{review.shot.description}</Text>
    <Text style={s.body}>{target===review.shot.selected_video?'镜头已采用':'候选预览'}{version?' · 版本 '+version.versionNo:''}</Text>
    {version?.state==='AVAILABLE'&&version.relativePath?<View style={{height:260}}><VideoPlayer source={FileSystem.documentDirectory+version.relativePath}/></View>:<Text style={s.muted}>{target&&!version?'指定版本已不可用，未替换为其他候选':version?'版本记录仍保留，原文件待恢复':'此镜头尚未采用视频，请选择候选'}</Text>}
    <View style={s.row}>{review.versions.map((v,index)=><TextAction key={v.id} label={(v.id===review.shot.selected_video?'已采用 · ':'候选 · ')+(index+1)+' · v'+v.versionNo} onPress={()=>{setSelected(v.id);setNotice('');}}/>)}</View>
    {version?<><MediaPreview version={version} kind="video" label="所选候选封面" style={{width:96,height:54}}/><TextAction label="采用此版本" disabled={busy||review.archived||version.state!=='AVAILABLE'||version.id===review.shot.selected_video} onPress={()=>void apply()}/><TextAction label="查看素材与版本" onPress={()=>router.push({pathname:'/creative-asset/[id]',params:{id:version.assetId,versionId:version.id,projectId}})}/></>:null}
    {review.drafts[0]?<TextAction label="打开视频工作台与生成历史" onPress={()=>router.push({pathname:'/creative-draft/[id]',params:{id:review.drafts[0].id}})}/>:null}
   </>:!error?<Text style={s.muted}>正在读取镜头…</Text>:null}
   {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
   {notice?<Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text>:null}
   <TextAction label="返回此镜头" disabled={busy} onPress={()=>void returnToProject(router,{projectId,shotId}).catch(()=>setError('项目读取失败'))}/>
  </ScrollView>
 </SafeAreaView></CompactWorkbench>;
}
