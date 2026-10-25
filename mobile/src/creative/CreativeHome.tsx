import {TaskInboxButton} from '../tasks/TaskInboxButton';
import { readCreativeIdea, writeCreativeIdea, type CreativeIdea } from './creativeIdea';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
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

function RecentCreation({ draft, generations, onPress }: { draft: CreativeDraft; generations:number; onPress: () => void }) {
  const input=JSON.parse(draft.input_json);
  const [version, setVersion] = useState<AssetVersion>();
  useEffect(() => {
    let active = true;
    if (draft.target_asset_id) void creativeService().versions(draft.target_asset_id).then(rows => { if (active) setVersion(rows[0]); }).catch(() => undefined);
    return () => { active = false; };
  }, [draft.target_asset_id, draft.revision]);
  const name=input.prompt || (version?.recipe.input as {prompt?:string}|undefined)?.prompt || '未命名创作';
  return <Pressable accessibilityRole="button" accessibilityLabel={`继续创作：${name}`} onPress={onPress} style={({pressed}) => ({ flexDirection:'row',alignItems:'center',gap:10,paddingVertical:8,borderBottomWidth:1,borderBottomColor:COLORS.border,opacity:pressed?0.65:1 })}>
    <MediaPreview version={version} kind={draft.provider_id==='novelai'?'image':'video'} label="创作预览" style={{width:52,aspectRatio:1,borderRadius:6}} />
    <View style={{flex:1,gap:3}}><Text style={s.body} numberOfLines={2}>{name}</Text><Text style={s.muted}>{generations?`${generations} 次生成`:'草稿'}{draft.state==='EDITING'?' · 有可编辑输入':''}</Text></View>
  </Pressable>;
}

export function CreativeHome({ onLegacyVideo }: { onLegacyVideo: () => void }) {
  const router=useRouter();
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
  const mode=idea.mode,groups=groupWorkbenchDrafts(drafts,mode),current=active[mode];
  return <CompactWorkbench><View style={s.screen}>
    <View style={{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:COLORS.border}}><WorkbenchModeSwitcher mode="create" disabled={busy || !ready} onSelect={id=>void change(async()=>{router.navigate(`/(tabs)/${id}`);})}/><View style={{width:112,flexShrink:1}}><SegmentedChoices singleRow label="创作类型" options={[{id:'image',label:'图片'},{id:'video',label:'视频'}]} value={mode} disabled={!ready || busy} onChange={chooseMode} /></View><View style={{flex:1}}/><IconAction label="新建创作" icon="add" disabled={busy || !ready} onPress={()=>void change(async()=>{const row=await createDraft(mode);setActive(old=>({...old,[mode]:row}));})} /><IconAction label="创作记录与导航" icon="grid_view" onPress={()=>{setRecords(true);void refresh().catch(()=>setError('创作记录读取失败'));}} /><TaskInboxButton/><IconAction label="打开设置" icon="settings" onPress={()=>router.push('/(tabs)/settings')} /></View>
    {error?<View style={{paddingHorizontal:12,paddingVertical:4}}><Text accessibilityRole="alert" style={s.error}>{error}</Text>{!current?<TextAction label="重试恢复工作区" onPress={()=>{setReady(false);void readCreativeIdea().then(value=>{setIdea(value);setError('');setReady(true);}).catch(()=>setError('工作区恢复失败'));}} />:null}</View>:null}
    <WorkbenchNavigationContext.Provider value={navigation}>{current?mode==='image'?<ImageDraftScreen key={current.id} id={current.id} embedded />:<VideoDraftScreen key={current.id} id={current.id} embedded />:<View style={{flex:1,alignItems:'center',justifyContent:'center'}}><ActivityIndicator /><Text style={s.muted}>正在恢复工作区…</Text></View>}</WorkbenchNavigationContext.Provider>
    {records?<ParameterSheet title="创作记录" description={mode==='image'?'图片创作 · 每组包含输入、任务和版本':'视频创作 · 每组包含输入、任务和版本'} onClose={()=>setRecords(false)}>
      {groups.slice(0,20).map(group=><RecentCreation key={group.draft.id} {...group} onPress={()=>void change(async()=>{const rows=await refresh();const selected=group.draft.target_asset_id?groupWorkbenchDrafts(rows,mode).find(g=>g.draft.target_asset_id===group.draft.target_asset_id && g.draft.project_id===group.draft.project_id && g.draft.shot_id===group.draft.shot_id)?.draft:rows.find(d=>d.id===group.draft.id);setActive(old=>({...old,[mode]:selected??group.draft}));setRecords(false);})} />)}
      {!groups.length?<Text style={s.muted}>完成编辑或生成后，创作会保存在这里。</Text>:null}
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:4}}>
      <TextAction label="全部任务与草稿" onPress={()=>{setRecords(false);router.push('/creative-drafts');}} />
      <TextAction label="素材库" onPress={()=>{setRecords(false);router.push('/(tabs)/assets');}} />
      <TextAction label="任务中心" onPress={()=>{setRecords(false);router.push('/(tabs)/tasks');}} />
      <TextAction label="项目与分镜" onPress={()=>{setRecords(false);router.push('/(tabs)/projects');}} />
      <TextAction label="设置" onPress={()=>{setRecords(false);router.push('/(tabs)/settings');}} />
      <TextAction label="工作流视频编辑器" onPress={()=>void change(async()=>{setRecords(false);onLegacyVideo();})} />
      </View>
    </ParameterSheet>:null}

  </View></CompactWorkbench>;
}
