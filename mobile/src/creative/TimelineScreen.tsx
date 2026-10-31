import {executorWakePort} from '../tasks/executorEvents';
import {useLiveRefresh} from './useLiveRefresh';
import {useEffect,useRef,useState} from 'react';
import {Alert,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {getDatabase} from '../storage/databaseClient';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from './creativeUI';
import {creativeService} from './runtime';
import {CreativeAssetPicker} from './CreativeAssetPicker';
import {readTimelinePage,timelineManifest,timelineSpec,type TimelineSpec,type TimelineRow} from './timelines';
import {useUnsavedChanges} from './useUnsavedChanges';
import {saveCreativeText} from './fileImport';
import {createId} from '../ids';
const empty=():TimelineSpec=>({schemaVersion:1,orientation:'portrait',clips:[],audio:null});
export function TimelineScreen(){
 const {projectId}=useLocalSearchParams<{projectId:string}>(),router=useRouter();
 const [spec,setSpec]=useState<TimelineSpec>(empty),[title,setTitle]=useState('项目成片'),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [picker,setPicker]=useState<'video'|'audio'>(),[rows,setRows]=useState<TimelineRow[]>([]),[next,setNext]=useState<{createdAt:number;id:string}>();
 const [renders,setRenders]=useState<Array<{id:string;timeline_id:string;state:string;error:string|null;output_version_id:string|null}>>([]);
 useLiveRefresh(async current=>{const rows=await getDatabase().getAllAsync<{id:string;timeline_id:string;state:string;error:string|null;output_version_id:string|null}>("SELECT r.* FROM creative_timeline_renders r JOIN creative_timelines t ON t.id=r.timeline_id WHERE t.project_id=? ORDER BY r.created_at DESC LIMIT 100",projectId);if(current())setRenders(rows);},2000,projectId);
 const lock=useRef(false);const leave=useUnsavedChanges(dirty,busy);
 const refresh=async(after?:{createdAt:number;id:string})=>{const page=await readTimelinePage(getDatabase(),projectId,after);setRows(page.items);setNext(page.next);};
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[projectId]);
 const work=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{lock.current=false;setBusy(false);}};
 const update=(value:TimelineSpec)=>{setSpec(value);setDirty(true);};
 const patch=(index:number,value:Partial<TimelineSpec['clips'][number]>)=>update({...spec,clips:spec.clips.map((c,i)=>i===index?{...c,...value}:c)});
 const move=(index:number,delta:number)=>{const clips=[...spec.clips];[clips[index],clips[index+delta]]=[clips[index+delta],clips[index]];update({...spec,clips});};
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={{padding:16,gap:12}}>
  <ListAction label="返回项目" secondary disabled={busy} onPress={()=>router.back()}/><Text style={s.title}>成片时间线</Text>
  <Text style={s.body}>最多 20 段、总长 120 秒。保存固定视频版本与裁剪；修改后另存工程。字幕为可开关字幕轨，音轨替换片段原声；未选择音轨时成片静音。</Text>
  {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  <TextInput accessibilityLabel="工程名称" editable={!busy} value={title} onChangeText={v=>{setTitle(v);setDirty(true);}} style={s.input}/>
  <ListAction label={spec.orientation==='portrait'?'画幅：竖屏 720 × 1280':'画幅：横屏 1280 × 720'} secondary disabled={busy} onPress={()=>update({...spec,orientation:spec.orientation==='portrait'?'landscape':'portrait'})}/>
  <Text style={s.body}>{spec.clips.length} 段 · 总时长 {spec.clips.reduce((n,c)=>n+c.durationMs,0)/1000} 秒</Text>
  {spec.clips.map((clip,i)=><View key={i} style={s.card}><Text selectable style={s.body}>{i+1}. 视频版本 {clip.versionId}</Text>
   <Text style={s.muted}>起点 / 时长（毫秒）</Text><TextInput accessibilityLabel={`片段 ${i+1} 起点`} editable={!busy} keyboardType="numeric" value={String(clip.startMs)} onChangeText={v=>patch(i,{startMs:Number(v)})} style={s.input}/>
   <TextInput accessibilityLabel={`片段 ${i+1} 时长`} editable={!busy} keyboardType="numeric" value={String(clip.durationMs)} onChangeText={v=>patch(i,{durationMs:Number(v)})} style={s.input}/>
   <TextInput accessibilityLabel={`片段 ${i+1} 字幕`} editable={!busy} multiline maxLength={500} placeholder="此片段字幕" value={clip.caption} onChangeText={v=>patch(i,{caption:v})} style={s.input}/>
   {i>0?<ListAction label="上移片段" secondary disabled={busy} onPress={()=>move(i,-1)}/>:null}{i<spec.clips.length-1?<ListAction label="下移片段" secondary disabled={busy} onPress={()=>move(i,1)}/>:null}
   <ListAction label="移除片段" secondary disabled={busy} onPress={()=>update({...spec,clips:spec.clips.filter((_,j)=>i!==j)})}/>
  </View>)}
  <ListAction label="添加项目视频" secondary disabled={busy||spec.clips.length>=20} onPress={()=>setPicker('video')}/>
  <ListAction label="按镜头顺序载入已选视频" secondary disabled={busy||spec.clips.length>0} onPress={()=>void work(async()=>{const shots=await creativeService().shots(projectId);const selected=shots.filter(shot=>shot.selected_video);if(selected.length>20)throw new Error('超过 20 个镜头，请手动选择');update({...spec,clips:selected.map(shot=>({versionId:shot.selected_video!,startMs:0,durationMs:5000,caption:''}))});})}/>
  <ListAction label={spec.audio?'替换音轨':'选择项目音轨'} secondary disabled={busy} onPress={()=>setPicker('audio')}/>
  {spec.audio?<View style={s.card}><Text selectable style={s.body}>音轨版本 {spec.audio.versionId}</Text><TextInput accessibilityLabel="音轨起点毫秒" editable={!busy} keyboardType="numeric" value={String(spec.audio.startMs)} onChangeText={v=>update({...spec,audio:{...spec.audio!,startMs:Number(v)}})} style={s.input}/><TextInput accessibilityLabel="音轨音量零到一" editable={!busy} keyboardType="numeric" value={String(spec.audio.volume)} onChangeText={v=>update({...spec,audio:{...spec.audio!,volume:Number(v)}})} style={s.input}/><ListAction label="移除音轨" secondary disabled={busy} onPress={()=>update({...spec,audio:null})}/></View>:null}
  <ListAction label="保存新工程快照" disabled={busy||!spec.clips.length} onPress={()=>void work(async()=>{await creativeService().execute({name:'timeline.create',payload:{projectId,title,spec}},createId());setDirty(false);await refresh();})}/>
  <Text style={s.title}>已保存工程</Text>
  {rows.map(row=><View key={row.id} style={s.card}><Text style={s.body}>{row.title} · {new Date(row.created_at).toLocaleString()}</Text>
   <ListAction label="在本机合成" disabled={busy||renders.some(r=>r.timeline_id===row.id&&['QUEUED','RENDERING','SUCCEEDED'].includes(r.state))} onPress={()=>void work(async()=>{await creativeService().execute({name:'timeline.render',payload:{id:row.id}},createId());executorWakePort.signal('command');})}/>
   {renders.filter(r=>r.timeline_id===row.id).map(render=><View key={render.id}><Text style={s.body}>{({QUEUED:'等待本地合成',RENDERING:'正在合成',SUCCEEDED:'成片已加入项目素材',FAILED:'合成失败',CANCELLED:'已取消',QUARANTINED:'恢复后已隔离'} as Record<string,string>)[render.state]}{render.error?' · '+render.error:''}</Text>{['QUEUED','RENDERING'].includes(render.state)?<ListAction label="取消合成" secondary disabled={busy} onPress={()=>void work(async()=>{await creativeService().execute({name:'timeline.cancelRender',payload:{id:render.id}},createId());})}/>:null}{render.output_version_id?<ListAction label="导出成片" disabled={busy} onPress={()=>void work(async()=>{await creativeService().execute({name:'asset.export',payload:{versionId:render.output_version_id!}},createId());executorWakePort.signal('command');})}/>:null}</View>)}
   <ListAction label="载入副本继续编辑" secondary disabled={busy} onPress={()=>leave(()=>{setSpec(timelineSpec.parse(JSON.parse(row.spec_json)));setTitle(row.title);setDirty(false);})}/>
   <ListAction label="生成工程清单文档" secondary disabled={busy} onPress={()=>void work(async()=>{const manifest=await timelineManifest(getDatabase(),row.id,projectId);await saveCreativeText({title:row.title+' · 工程清单',kind:'document',content:JSON.stringify(manifest,null,2),projectId});setError('工程清单已保存到项目素材，可从素材详情导出；清单不包含媒体文件。');})}/>
   <ListAction label="移除工程" secondary disabled={busy} onPress={()=>Alert.alert('移除工程','保留输入视频、音轨及已经导出的清单。',[{text:'取消',style:'cancel'},{text:'移除',style:'destructive',onPress:()=>void work(async()=>{await creativeService().execute({name:'timeline.discard',payload:{id:row.id}},createId());await refresh();})}])}/>
  </View>)}
  {next?<ListAction label="更早的工程" secondary disabled={busy} onPress={()=>void work(()=>refresh(next))}/>:null}<ListAction label="最新工程" secondary disabled={busy} onPress={()=>void work(()=>refresh())}/>
 </ScrollView>{picker?<CreativeAssetPicker kind={picker} projectId={projectId} restrictToProject onClose={()=>setPicker(undefined)} onChoose={async version=>{update(picker==='video'?{...spec,clips:[...spec.clips,{versionId:version.id,startMs:0,durationMs:5000,caption:''}]}:{...spec,audio:{versionId:version.id,startMs:0,volume:1}});setPicker(undefined);}}/>:null}</SafeAreaView>;
}
