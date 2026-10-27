import { RecordRow } from '../ui/RecordRow';
import { ListFilters } from '../ui/ListPageUI';
import {TaskInboxButton} from '../tasks/TaskInboxButton';
import { readCreativeIdea, writeCreativeIdea, type CreativeIdea } from './creativeIdea';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { creativeService } from './runtime';
import { defaultNovelAiDraft } from './novelAiProtocol';
import type { CreativeDraft } from './drafts';
import { createId } from '../ids';
import { creativeUI as s } from './creativeUI';
import { CompactWorkbench, IconAction, ParameterSheet, SegmentedChoices, TextAction, WorkbenchNavigationContext } from './WorkbenchUI';
import { MediaPreview } from './MediaPreview';
import { ImageDraftScreen } from './ImageDraftScreen';
import { VideoDraftScreen } from './VideoDraftScreen';
import { groupWorkbenchDrafts, recentWorkbenchDraft, type WorkbenchMode } from './workbenchSessions';
import type { AssetVersion } from './types';
import { WorkbenchModeSwitcher } from '../ui/WorkbenchModeSwitcher';
import { COLORS } from '../ui/theme';
import {createVideoWorkbenchDraft} from './videoWorkbenchWorkflows';

function RecentCreation({ draft, generations, version, selected, onPress }: { draft: CreativeDraft; generations:number; version?:AssetVersion; selected:boolean; onPress: () => void }) {
  let input:Record<string,any>={};try{input=JSON.parse(draft.input_json);}catch{}
  const name=input.prompt || input.values?.prompt || (version?.recipe.input as {prompt?:string}|undefined)?.prompt || '未命名创作';
  return <RecordRow title={name} selected={selected} detail={`${draft.provider_id==='novelai'?'图片':'视频'} · ${generations?`${generations} 次生成`:'草稿'}${draft.state==='EDITING'?' · 可继续编辑':''}`} meta={draft.updated_at?new Date(draft.updated_at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):undefined} leading={<MediaPreview version={version} kind={draft.provider_id==='novelai'?'image':'video'} label="创作预览" style={{width:56,height:56,borderRadius:8}}/>} onPress={onPress}/>;
}

export function CreativeHome({ onLegacyVideo }: { onLegacyVideo: () => void }) {
  const router=useRouter();
  const [recordQuery,setRecordQuery]=useState(''),[recordMode,setRecordMode]=useState<'all'|WorkbenchMode>('all'),[recordLimit,setRecordLimit]=useState(30),[covers,setCovers]=useState<Record<string,AssetVersion>>({});
  const [idea,setIdea]=useState<CreativeIdea>({mode:'image',image:'',video:''});
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [active,setActive]=useState<Partial<Record<WorkbenchMode,CreativeDraft>>>({});
  const [drafts,setDrafts]=useState<CreativeDraft[]>([]),[records,setRecords]=useState(false);
  const lock=useRef(false),leave=useRef<()=>Promise<boolean>>(async()=>true),activeRef=useRef(active);activeRef.current=active;
  const navigation=useMemo(()=>({register:(guard:()=>Promise<boolean>)=>{leave.current=guard;return()=>{if(leave.current===guard)leave.current=async()=>true;};}}),[]);
  const refresh=async()=>{const rows=await creativeService().drafts();setDrafts(rows);return rows;};
  useEffect(()=>{let live=true;void readCreativeIdea().then(value=>{if(live){setIdea(value);setReady(true);}}).catch(()=>{if(live)setError('工作区恢复失败，请重试');});return()=>{live=false;};},[]);
  useFocusEffect(useCallback(()=>{let live=true;void creativeService().drafts().then(rows=>{if(live)setDrafts(rows);}).catch(()=>{if(live)setError('创作记录读取失败');});return()=>{live=false;};},[]));
  const createDraft=async(mode:WorkbenchMode)=>{
    const result=mode==='image'?await creativeService().execute({name:'draft.createImage',payload:{input:{...defaultNovelAiDraft,prompt:idea.image}}},createId()):await createVideoWorkbenchDraft(idea.video);
    if(result.status!=='completed')throw new Error('无法创建工作区');
    const row=await creativeService().draft(result.value.draftId);if(!row)throw new Error('工作区读取失败');
    const next={...idea,[mode]:''};await writeCreativeIdea(next);setIdea(next);return row;
  };
  useEffect(()=>{
    if(!ready || activeRef.current[idea.mode] || lock.current)return;
    let live=true;lock.current=true;setBusy(true);
    void (async()=>{const rows=await creativeService().drafts();const row=await recentWorkbenchDraft(idea.mode,rows)??await createDraft(idea.mode);if(live){setDrafts(rows);setActive(old=>({...old,[idea.mode]:row}));}})().catch(e=>{if(live)setError(e.message??'工作区读取失败');}).finally(()=>{lock.current=false;if(live)setBusy(false);});
    return()=>{live=false;};
  },[ready,idea.mode]);
  const change=async(action:()=>Promise<void>)=>{
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try{if(!await leave.current())throw new Error('请等待输入保存，或先处理工作区中的错误');await action();}
    catch(e){setError(e instanceof Error?e.message:'无法切换工作区');}
    finally{lock.current=false;setBusy(false);}
  };
  const chooseMode=(mode:WorkbenchMode)=>{if(mode===idea.mode)return;void change(async()=>{const rows=await refresh(),restored=await recentWorkbenchDraft(mode,rows),row=restored??await createDraft(mode);const next=restored?{...idea,mode}:{...idea,mode,[mode]:''};await writeCreativeIdea(next);setActive(old=>({...old,[mode]:row}));setIdea(next);});};
  const mode=idea.mode,current=active[mode];
  const groups=useMemo(()=>[...groupWorkbenchDrafts(drafts,'image'),...groupWorkbenchDrafts(drafts,'video')].filter(g=>(recordMode==='all'||(g.draft.provider_id==='novelai'?'image':'video')===recordMode)&&g.draft.input_json.toLocaleLowerCase().includes(recordQuery.trim().toLocaleLowerCase())).sort((a,b)=>(b.draft.updated_at??0)-(a.draft.updated_at??0)),[drafts,recordMode,recordQuery]);
  const coverKey=records?groups.slice(0,recordLimit).map(g=>g.draft.target_asset_id).filter(Boolean).join('|'):'';
  useEffect(()=>{let live=true;if(coverKey)void creativeService().latestVersions(coverKey.split('|')).then(rows=>{if(live)setCovers(Object.fromEntries(rows.map(v=>[v.assetId,v])));}).catch(()=>undefined);return()=>{live=false;};},[coverKey,drafts]);
  return <CompactWorkbench><View style={s.screen}>
    <View style={{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:COLORS.border}}><WorkbenchModeSwitcher mode="create" disabled={busy || !ready} onSelect={id=>void change(async()=>{router.navigate(`/(tabs)/${id}`);})}/><View style={{width:112,flexShrink:1}}><SegmentedChoices singleRow label="创作类型" options={[{id:'image',label:'图片'},{id:'video',label:'视频'}]} value={mode} disabled={!ready || busy} onChange={chooseMode} /></View><View style={{flex:1}}/><IconAction label="新建创作" icon="add" disabled={busy || !ready} onPress={()=>void change(async()=>{const row=await createDraft(mode);setActive(old=>({...old,[mode]:row}));})} /><IconAction label="创作记录" icon="grid_view" onPress={()=>{setRecords(true);void refresh().catch(()=>setError('创作记录读取失败'));}} /><TaskInboxButton/><IconAction label="打开设置" icon="settings" onPress={()=>router.push('/(tabs)/settings')} /></View>
    {error?<View style={{paddingHorizontal:12,paddingVertical:4}}><Text accessibilityRole="alert" style={s.error}>{error}</Text>{!current?<TextAction label="重试恢复工作区" onPress={()=>{setReady(false);void readCreativeIdea().then(value=>{setIdea(value);setError('');setReady(true);}).catch(()=>setError('工作区恢复失败'));}} />:null}</View>:null}
    <WorkbenchNavigationContext.Provider value={navigation}>{current?mode==='image'?<ImageDraftScreen key={current.id} id={current.id} embedded />:<VideoDraftScreen key={current.id} id={current.id} embedded />:<View style={{flex:1,alignItems:'center',justifyContent:'center'}}><ActivityIndicator /><Text style={s.muted}>正在恢复工作区…</Text></View>}</WorkbenchNavigationContext.Provider>
    {records?<ParameterSheet title="创作记录" description="恢复输入与生成历史" onClose={()=>setRecords(false)}>
      <TextInput accessibilityLabel="搜索创作记录" placeholder="搜索提示词、创作内容" value={recordQuery} onChangeText={value=>{setRecordQuery(value);setRecordLimit(30);}} style={s.input}/>
      <ListFilters compact label="创作记录类型" options={[{id:'all',label:'全部'},{id:'image',label:'图片'},{id:'video',label:'视频'}]} value={recordMode} onChange={value=>{setRecordMode(value);setRecordLimit(30);}}/>
      {groups.slice(0,recordLimit).map(group=><RecentCreation key={group.draft.id} {...group} selected={group.draft.id===current?.id} version={covers[group.draft.target_asset_id??'']} onPress={()=>void change(async()=>{const selectedMode=group.draft.provider_id==='novelai'?'image':'video';const rows=await refresh();const selected=group.draft.target_asset_id?groupWorkbenchDrafts(rows,selectedMode).find(g=>g.draft.target_asset_id===group.draft.target_asset_id && g.draft.project_id===group.draft.project_id && g.draft.shot_id===group.draft.shot_id)?.draft:rows.find(d=>d.id===group.draft.id);const next:CreativeIdea={...idea,mode:selectedMode};await writeCreativeIdea(next);setIdea(next);setActive(old=>({...old,[selectedMode]:selected??group.draft}));setRecords(false);})} />)}
      {!groups.length?<Text style={s.muted}>完成编辑或生成后，创作会保存在这里。</Text>:null}
      {groups.length>recordLimit?<TextAction label={`加载更多 · 还有 ${groups.length-recordLimit} 组`} onPress={()=>setRecordLimit(count=>count+30)}/>:null}
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
        <TextAction label="项目与素材" onPress={()=>{setRecords(false);router.push('/(tabs)/projects');}}/>
        <TextAction label="高级工作流编辑器" onPress={()=>void change(async()=>{setRecords(false);onLegacyVideo();})}/>
      </View>
    </ParameterSheet>:null}

  </View></CompactWorkbench>;
}
