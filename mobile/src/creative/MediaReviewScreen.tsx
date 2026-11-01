import {useUnsavedChanges} from './useUnsavedChanges';
import {useEffect,useRef,useState} from 'react';
import {Alert,Image,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {getDatabase} from '../storage/databaseClient';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from './creativeUI';
import {CreativeAssetPicker} from './CreativeAssetPicker';
import {inspectProjectMedia,prepareInspectionReview,sendInspectionReview,type Inspection} from './mediaInspectionRuntime';
import {activeLlmConnection} from '../settings/llmConnections';
import type {ReviewRow} from './mediaReview';
import {saveCreativeText} from './fileImport';
const defaultPrompt='检查主体外观、构图、可见瑕疵和抽帧之间的一致性，列出依据与不确定性。';
export function MediaReviewScreen(){
 const {projectId,versionId:initialVersionId}=useLocalSearchParams<{projectId:string;versionId?:string}>(),router=useRouter(),lock=useRef(false),controller=useRef<AbortController|null>(null);
 const [picker,setPicker]=useState<'image'|'video'|'audio'>(),[versionId,setVersionId]=useState(''),[inspected,setInspected]=useState<Inspection>(),[prompt,setPrompt]=useState(defaultPrompt),[rows,setRows]=useState<ReviewRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 // Both header and system Back remove this route and share the navigation guard.
 useUnsavedChanges(prompt!==defaultPrompt,busy);
 const [next,setNext]=useState<{createdAt:number;id:string}>();
 const refresh=async(after?:{createdAt:number;id:string})=>{const page=await getDatabase().getAllAsync<ReviewRow>('SELECT * FROM creative_media_reviews WHERE project_id=? AND (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 21',projectId,after?.createdAt??null,after?.createdAt??null,after?.createdAt??null,after?.id??null);setRows(page.slice(0,20));setNext(page.length>20?{createdAt:page[19].created_at,id:page[19].id}:undefined);};
 useEffect(()=>{void refresh().catch(e=>setError(e.message));return()=>controller.current?.abort();},[projectId]);
 useEffect(()=>{let active=true;if(!initialVersionId)return;lock.current=true;setBusy(true);setInspected(undefined);setVersionId(initialVersionId);void inspectProjectMedia(projectId,initialVersionId).then(value=>{if(active)setInspected(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active){lock.current=false;setBusy(false);}});return()=>{active=false;};},[projectId,initialVersionId]);
 const work=async(fn:()=>Promise<void>,keepPage=false)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();if(!keepPage)await refresh();}catch(e){setError(e instanceof Error?e.message:'检查失败');await refresh().catch(()=>undefined);}finally{lock.current=false;setBusy(false);}};
 const prepare=()=>void work(async()=>{
  const connection=await activeLlmConnection();if(!connection||connection.revoked||!connection.images)throw Error('请在模型连接页显式选择支持图片的连接');if(!inspected)throw Error('请先本地探测');
  const id=await prepareInspectionReview(projectId,versionId,inspected,connection,prompt);
  Alert.alert('允许发送抽帧并调用一次模型',`目标：${new URL(connection.endpoint).host} / ${connection.model}\n素材版本：${versionId}\n${inspected.frames.length} 张缩略帧及当前检查要求将发送。最多 1 次请求、1000 输出 token、120 秒，不自动重试；费用未知。这不授权任何生成或采用。`,[{text:'取消',style:'cancel',onPress:()=>void getDatabase().runAsync("UPDATE creative_media_reviews SET state='CANCELLED' WHERE id=? AND state='PREPARED'",id).then(()=>refresh())},{text:'同意本次外发与调用',onPress:()=>void work(async()=>{controller.current=new AbortController();try{await sendInspectionReview(id,controller.current.signal);}finally{controller.current=null;}})}]);
 });
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={{padding:16,gap:12}}><ListAction label="返回来源" secondary onPress={()=>router.back()}/><Text style={s.title}>媒体检查</Text><Text style={s.body}>本地核验原件、读取尺寸/时长并抽取最多 3 帧，无外发。模型检查需要另行确认，仅评估所示静帧，不验证运动、音频或整片字幕。</Text><ListAction label="配置检查模型" secondary disabled={busy} onPress={()=>router.push('/model-connections')}/>{(['image','video','audio'] as const).map(kind=><ListAction key={kind} label={'本地探测'+({image:'图片',video:'视频',audio:'音频'})[kind]} secondary disabled={busy} onPress={()=>setPicker(kind)}/>)}{error?<Text style={s.error}>{error}</Text>:null}
 {inspected?<View style={s.card}><Text selectable style={s.body}>版本 {versionId}{'\n'}{inspected.width??'—'} × {inspected.height??'—'} · {inspected.durationMs??0}ms · {inspected.byteSize} 字节{'\n'}SHA-256 {inspected.sha256}</Text>{inspected.frames.map(frame=><View key={frame.timestampMs}><Image accessibilityLabel={`检查抽帧 ${frame.timestampMs} 毫秒`} source={{uri:frame.uri}} style={{width:'100%',height:220}} resizeMode="contain"/><Text style={s.muted}>{frame.timestampMs}ms</Text></View>)}</View>:null}
 <TextInput accessibilityLabel="检查要求" multiline maxLength={1500} editable={!busy} value={prompt} onChangeText={setPrompt} style={s.input}/><ListAction label="准备一次模型检查" disabled={busy||!inspected?.frames.length||!prompt.trim()} onPress={prepare}/>{busy?<ListAction label="停止等待模型" secondary onPress={()=>controller.current?.abort()}/>:null}
 <Text style={s.title}>检查记录</Text>{rows.map(row=><View key={row.id} style={s.card}><Text selectable style={s.body}>{row.model} · {row.version_id}{'\n'}{({PREPARED:'未发送，需重新准备确认',SENDING:'发送状态待核查；不会自动重发',DONE:'检查完成，尚未采用',UNKNOWN:'结果未知，不自动重试',CANCELLED:'已取消'} as Record<string,string>)[row.state]}</Text>{row.report?<><Text selectable style={s.body}>{row.report}</Text><ListAction label="保存检查报告到项目" secondary disabled={busy} onPress={()=>void work(async()=>{await saveCreativeText({title:'媒体检查报告',kind:'document',projectId,content:JSON.stringify({versionId:row.version_id,sourceHash:row.source_hash,model:row.model,frames:JSON.parse(row.frames_json),report:row.report,usage:row.usage_json,adopted:false},null,2)},'review-report:'+row.id);})}/></>:null}</View>)}
 {next?<ListAction label="更早的检查记录" secondary disabled={busy} onPress={()=>void work(()=>refresh(next),true)}/>:null}<ListAction label="最新检查记录" secondary disabled={busy} onPress={()=>void work(()=>refresh())}/>
 </ScrollView>{picker?<CreativeAssetPicker kind={picker} projectId={projectId} restrictToProject onClose={()=>setPicker(undefined)} onChoose={async version=>{setPicker(undefined);await work(async()=>{setInspected(undefined);setVersionId(version.id);setInspected(await inspectProjectMedia(projectId,version.id));});}}/>:null}</SafeAreaView>;
}
