import { RecordRow } from '../ui/RecordRow';
import {VideoCostHint} from './VideoCostHint';
import {AutodlWalletPanel} from './AutodlWalletPanel';
import {VideoReferenceCards} from './VideoReferenceCards';
import {ImageEditorDrawer} from './ImageEditorDrawer';
import {VideoGenerationHistory} from './VideoGenerationHistory';
import {generationReadiness} from './generationReadiness';
import {useKeyboardVisible} from '../ui/useKeyboardVisible';
import { KeyboardSurface, KeyboardAwareScrollView as ScrollView } from '../ui/KeyboardSurface';
import {useWorkbenchJobPending} from './useWorkbenchJobPending';
import {useCallback,useEffect,useRef,useState} from 'react';
import { Alert, BackHandler, Image, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {useNavigation,usePreventRemove,useIsFocused} from 'expo-router/react-navigation';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import {creativeService,creativeFiles,importCreativeImage} from './runtime';
import {importCreativeFile} from './fileImport';
import type {CreativeDraft} from './drafts';
import {createId} from '../ids';
import {COLORS} from '../ui/theme';
import {CreativeResults} from './CreativeResults';
import {CreativeAssetPicker} from './CreativeAssetPicker';
import {creativeUI as s} from './creativeUI';
import {pickImagesFromGallery} from '../native/imagePicker';
import {prepareCreativeVideo,confirmCreativeVideo} from './videoRuntime';
import {PromptAssistSheet} from './PromptAssistSheet';
import {CompactWorkbench,IconAction,ParameterSheet,SegmentedChoices,TextAction,useWorkbenchLeave} from './WorkbenchUI';
import {creativeError} from './creativeError';
import {useDraftSync} from './useDraftSync';
import {persistVideoWorkbenchInput} from './imageWorkbenchSession';
import {rememberWorkbenchDraft,workbenchResultDraft,videoSessionDrafts} from './workbenchSessions';
import {WorkbenchScope} from './WorkbenchScope';
import {NovelAiNumberField} from './NovelAiNumberField';
import {ImagePreview} from '../ui/ImagePreview';
import {WorkflowForm} from '../workflows/renderer/WorkflowForm';
import {inputField,inputProperties,mediaConstraints} from '../workflows/inputModel';
import {H3_CREATIVE_WORKFLOW_ID,creativeVideoWorkflowId} from './videoWorkflow';
import {alignVideoState,transferVideoValues,videoSession,workflowVideoState,type WorkflowVideoInput} from './videoDraftState';
import {listVideoWorkflows,resolveVideoWorkbench,rememberVideoWorkflow,videoAccountReady,type VideoWorkflowEntry} from './videoWorkbenchWorkflows';

type MediaRow=Awaited<ReturnType<ReturnType<typeof creativeService>['draftInputs']>>[number];
type Sheet='workflow'|'orientation'|'quality'|'duration'|'settings'|'account'|undefined;
export function VideoDraftScreen({id,embedded=false}:{id:string;embedded?:boolean}){return <CompactWorkbench><VideoCanvas key={id} initialId={id} embedded={embedded}/></CompactWorkbench>;}


function VideoCanvas({initialId,embedded}:{initialId:string;embedded:boolean}){
  const [workflowDetail,setWorkflowDetail]=useState<string>();
  const keyboardVisible=useKeyboardVisible();
  const [bodyHeight,setBodyHeight]=useState(600);
  const router=useRouter(),navigation=useNavigation(),focused=useIsFocused();
  const [id,setId]=useState(initialId),[draft,setDraft]=useState<CreativeDraft>(),[resultDraft,setResultDraft]=useState<CreativeDraft>();
  const [input,setInput]=useState<WorkflowVideoInput>(),[baseline,setBaseline]=useState('');
  const [entries,setEntries]=useState<VideoWorkflowEntry[]>([]),[entry,setEntry]=useState<VideoWorkflowEntry>(),[stale,setStale]=useState(false),[accountReady,setAccountReady]=useState(false);
  const [references,setReferences]=useState<MediaRow[]>([]);
  const [view,setView]=useState<'create'|'result'>('create'),[sheet,setSheet]=useState<Sheet>(),[picking,setPicking]=useState<'image'|'audio'>(),[assist,setAssist]=useState(false),[preview,setPreview]=useState<string>();
  const [error,setError]=useState(''),[workflowError,setWorkflowError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[status,setStatus]=useState('');
  const [undo,setUndo]=useState<WorkflowVideoInput>(),[undoDraft,setUndoDraft]=useState<string>(),[customDuration,setCustomDuration]=useState(false);
  const lock=useRef(false),switchLock=useRef(false),latest=useRef(input),latestDraft=useRef(draft),latestResult=useRef(resultDraft);latest.current=input;latestDraft.current=draft;latestResult.current=resultDraft;
  const initialized=useRef(false);
  const dirty=Boolean(input&&baseline&&JSON.stringify(input)!==baseline),definition=entry?.definition;
  const pending=useWorkbenchJobPending(resultDraft?.job_id,status);
  useFocusEffect(useCallback(()=>{
    let active=true;setAccountReady(false);
    void videoAccountReady().then(ready=>{if(active)setAccountReady(ready);}).catch(()=>{if(active)setAccountReady(false);});
    return()=>{active=false;};
  },[]));
  const editable=Boolean(draft&&input&&entry&&!stale&&!entry.reason&&!busy);
  const closePanel=useCallback(()=>{if(picking){setPicking(undefined);return true;}if(preview){setPreview(undefined);return true;}if(assist){if(Keyboard.isVisible())Keyboard.dismiss();else setAssist(false);return true;}if(sheet){Keyboard.dismiss();setSheet(undefined);return true;}if(view==='result'){setView('create');return true;}return false;},[picking,preview,assist,sheet,view]);
  useFocusEffect(useCallback(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',closePanel);return()=>sub.remove();},[closePanel]));
  usePreventRemove(dirty||busy||saving||Boolean(sheet),({data})=>{if(closePanel())return;if(lock.current||switchLock.current){Alert.alert('操作进行中','请等待保存或切换完成。');return;}Alert.alert('修改尚未保存','是否放弃本次未保存修改？',[{text:'继续编辑',style:'cancel'},{text:'放弃并离开',style:'destructive',onPress:()=>navigation.dispatch(data.action)}]);});
  const adopt=useCallback((row:CreativeDraft)=>{setId(row.id);setDraft(row);void rememberWorkbenchDraft(row).catch(()=>undefined);},[]);
  const install=async(row:CreativeDraft,available?:VideoWorkflowEntry[],canApply=()=>true)=>{
    const service=creativeService(),output=await workbenchResultDraft(row);
    if(!canApply())return;
    // Existing submissions remain observable even if their editor dependencies are unavailable.
    if(output.job_id!==latestResult.current?.job_id)setStatus('');
    setResultDraft(output.job_id?output:undefined);
    if(!initialized.current){initialized.current=true;setView(output.job_id?'result':'create');}
    const catalog=available??await listVideoWorkflows();if(!canApply())return;setEntries(catalog);
    const refs=await service.draftInputs(row.id);
    for(const ref of refs)await creativeFiles().verify(ref.version_id);
    const resolved=await resolveVideoWorkbench(row,catalog);
    if(!canApply())return;
    adopt(row);setEntry(resolved.entry);setInput(resolved.input);setBaseline(JSON.stringify(resolved.input));setStale(resolved.stale);setWorkflowError('');setReferences(await service.draftInputs(row.id));
    if(resolved.notices.length)setNotice(resolved.notices.join('\n'));
  };
  const load=async(canApply=()=>true)=>{
    const row=await creativeService().draft(id);if(!row)throw new Error('草稿不存在');
    if(canApply()){adopt(row);setEntry(undefined);}
    await install(row,undefined,canApply);
  };
  useFocusEffect(useCallback(()=>{
    if(!latestDraft.current)return; // Initial loading also installs the catalog.
    let active=true;
    void (async()=>{
      const available=await listVideoWorkflows();if(!active)return;setEntries(available);
      const source=latestDraft.current;if(!source)return;
      try{
        if(!latest.current){
          await install(source,available,()=>active&&latestDraft.current?.id===source.id&&!latest.current);
          if(active&&latestDraft.current?.id===source.id){setError('');setWorkflowError('');}
          return;
        }
        const resolved=await resolveVideoWorkbench(source,available);
        if(active&&latestDraft.current?.id===source.id){setEntry(resolved.entry);setStale(resolved.stale);setWorkflowError('');}
      }catch(e){if(active&&latestDraft.current?.id===source.id){setEntry(undefined);setStale(true);setWorkflowError(creativeError(e,'工作流读取失败'));}}
    })().catch(e=>{if(active)setWorkflowError(creativeError(e,'工作流目录读取失败'));});
    return()=>{active=false;};
  },[]));
  const {conflict,reload,assertCurrent}=useDraftSync(id,draft,dirty,busy||saving,load,setError);
  useEffect(()=>{let active=true;if(draft)void creativeService().draftInputs(id).then(rows=>{if(active)setReferences(rows);}).catch(()=>{if(active)setError('参考素材读取失败');});return()=>{active=false;};},[id,draft?.revision]);
  const save=async():Promise<CreativeDraft|false>=>{
    if(lock.current||conflict||!draft||!latest.current)return false;
    if(!dirty)return draft;
    lock.current=true;setSaving(true);setError('');const snapshot=latest.current;
    try{await assertCurrent();const row=await persistVideoWorkbenchInput(draft,snapshot,adopt);setBaseline(JSON.stringify(snapshot));return row;}
    catch(e){setError(creativeError(e,'输入未保存'));return false;}finally{lock.current=false;setSaving(false);}
  };
  useWorkbenchLeave(async()=>!switchLock.current&&!lock.current&&!conflict&&(!dirty||Boolean(await save())));
  useEffect(()=>{if(!dirty||busy||saving||error||conflict)return;const timer=setTimeout(()=>void save(),600);return()=>clearTimeout(timer);},[input,draft,dirty,busy,saving,error,conflict]);
  const changeValues=(values:Record<string,unknown>)=>{if(!input||!entry)return;setInput(workflowVideoState({...entry.record,version:input.workflow.version,contentHash:input.workflow.contentHash},entry.definition,input.sessionId,values));setError('');};
  const update=(field:string,value:unknown)=>{if(input)changeValues({...input.values,[field]:value});};
  const switchWorkflow=async(target:VideoWorkflowEntry,restoreId?:string)=>{
    if(lock.current||switchLock.current||!draft||target.reason)return;
    switchLock.current=true;setBusy(true);setError('');
    try{
      // A missing definition must still allow an explicit move to an installed workflow.
      const source=latest.current?await save():draft;if(!source)throw new Error('请先保存当前输入');
      const current=await creativeService().draft(source.id);if(!current||current.revision!==source.revision||current.state!==source.state)throw new Error('草稿已在其他入口更新，请先载入最新内容');lock.current=true;
      const rows=await creativeService().drafts(source.project_id??undefined),sourceInput=JSON.parse(source.input_json),session=videoSession(sourceInput,source.target_asset_id??source.id);
      const candidates=videoSessionDrafts(source,rows).filter(row=>row.id!==source.id&&['EDITING','SUBMITTED'].includes(row.state)&&creativeVideoWorkflowId(row.workflow_id)===target.record.workflowId&&(()=>{const raw=JSON.parse(row.input_json);return (raw.schemaVersion!==2||raw.workflow?.contentHash===target.record.contentHash)&&(!restoreId||row.id===restoreId);})());
      const cached=candidates.find(row=>row.state==='EDITING')??candidates[0];
      let row:CreativeDraft|undefined=cached;
      if(row?.state==='SUBMITTED'){
        const copied=await creativeService().execute({name:'draft.copySubmitted',payload:{id:row.id}},createId());
        if(copied.status!=='completed')throw new Error('原输入恢复失败');row=await creativeService().draft(copied.value.draftId)??undefined;if(!row)throw new Error('原输入恢复后读取失败');
      }
      if(!row){
        const values=definition&&input?transferVideoValues(definition,input.values):{prompt:sourceInput.prompt??''};
        const aligned=alignVideoState(target.record,target.definition,session,values),notes=[...aligned.notices];
        const carry=(kind:'image'|'audio')=>{
          const media=references.filter(ref=>(ref.slot==='audio')===(kind==='audio')),rules=mediaConstraints(target.definition,kind==='image'?'images':'audios');
          if(media.length>rules.maximum||media.some(ref=>!rules.mimes.includes(ref.mime))){notes.push(`${kind==='image'?'参考图':'音频'}未带入新工作流，已保留在原草稿`);return [];}
          return media.map(ref=>ref.version_id);
        };
        const result=await creativeService().execute({name:'draft.switchVideoWorkflow',payload:{id:source.id,expectedRevision:source.revision,input:aligned.input,imageVersionIds:carry('image'),audioVersionIds:carry('audio')}},createId());
        if(result.status!=='completed')throw new Error('工作流切换未完成');row=await creativeService().draft(result.value.draftId)??undefined;
        if(!row)throw new Error('新工作流草稿读取失败');setNotice(notes.length?notes.join('\n'):'已切换工作流，原输入已保留');
      }else setNotice('已恢复该工作流的输入');
      const oldId=source.id;await install(row,entries);setUndoDraft(oldId);setSheet(undefined);setView('create');
      void rememberVideoWorkflow(target.record.workflowId).catch(()=>undefined);
    }catch(e){setError(creativeError(e,'切换失败，原输入仍保留'));}finally{lock.current=false;switchLock.current=false;setBusy(false);}
  };
  const submit=async()=>{
    if(lock.current||switchLock.current||!draft||!latest.current||!editable||conflict)return;
    Keyboard.dismiss();lock.current=true;setBusy(true);setError('');const snapshot=latest.current;let requestId:string|undefined;
    try{
      await assertCurrent();const request=await persistVideoWorkbenchInput(draft,snapshot,adopt);requestId=request.id;
      const prepared=await prepareCreativeVideo(request.id);await confirmCreativeVideo(prepared);
      const row=await creativeService().draft(request.id);if(!row)throw new Error('任务已提交，请在任务中心核查');
      adopt(row);setResultDraft(row);setBaseline(JSON.stringify(snapshot));setStatus('QUEUED');setView('result');setSheet(undefined);
    }catch(e){setError(creativeError(e,'提交失败'));if(requestId)try{const row=await creativeService().draft(requestId);if(row?.state==='SUBMITTED'){adopt(row);setResultDraft(row);setStatus('UNKNOWN');setView('result');}}catch{/* Keep the original request for recovery. */}}finally{lock.current=false;setBusy(false);}
  };
  const writeReferences=async(kind:'image'|'audio',versionIds:string[])=>{
    if(!draft||!latest.current||!definition)throw new Error('工作区未就绪');
    const rules=mediaConstraints(definition,kind==='image'?'images':'audios');if(versionIds.length>rules.maximum)throw new Error('超过当前工作流的素材数量限制');
    for(const versionId of versionIds){const file=await creativeFiles().read(versionId);if(!file?.mime||!rules.mimes.includes(file.mime))throw new Error('素材格式不受当前工作流支持');}
    await assertCurrent();const snapshot=latest.current,row=await persistVideoWorkbenchInput(draft,snapshot,adopt);
    const ids=(slot:'image'|'audio')=>slot===kind?versionIds:references.filter(ref=>(ref.slot==='audio')===(slot==='audio')).map(ref=>ref.version_id);
    await creativeService().execute({name:'draft.replaceVideoMedia',payload:{id:row.id,expectedRevision:row.revision,imageVersionIds:ids('image'),audioVersionIds:ids('audio')}},createId());
    const saved=await creativeService().draft(row.id);if(!saved)throw new Error('素材保存失败');adopt(saved);setBaseline(JSON.stringify(snapshot));setReferences(await creativeService().draftInputs(row.id));
  };
  const replaceReferences=async(kind:'image'|'audio',ids:string[])=>{
    if(lock.current||switchLock.current||conflict||!editable)throw new Error('请等待保存完成');lock.current=true;setBusy(true);setError('');
    try{await writeReferences(kind,ids);}catch(e){setError(creativeError(e,'素材保存失败'));throw e;}finally{lock.current=false;setBusy(false);}
  };
  const importReference=async(kind:'image'|'audio')=>{
    if(lock.current||switchLock.current||!editable||!draft||!definition)return;lock.current=true;setBusy(true);setError('');
    try{
      const rules=mediaConstraints(definition,kind==='image'?'images':'audios');
      const existing=references.filter(ref=>(ref.slot==='audio')===(kind==='audio')).map(ref=>ref.version_id),remaining=rules.maximum-existing.length;
      if(remaining<=0)throw new Error('已达到当前工作流的素材数量限制');
      const files=kind==='image'?await pickImagesFromGallery(remaining):await (async()=>{const picked=await DocumentPicker.getDocumentAsync({type:rules.mimes,multiple:true,copyToCacheDirectory:true});return picked.canceled?[]:picked.assets;})();
      if(files.length>remaining)throw new Error(`最多还可添加 ${remaining} 个素材，请重新选择`);
      if(files.some(file=>!rules.mimes.includes(file.mimeType??'')))throw new Error('素材格式不受当前工作流支持');
      const added:string[]=[];
      for(const file of files){
        const result=kind==='image'?await importCreativeImage(file as Parameters<typeof importCreativeImage>[0],draft.project_id??undefined):await importCreativeFile(file,draft.project_id??undefined);
        if(result.status!=='completed')throw new Error('素材导入未完成，已导入的文件可从素材库选择');
        added.push(result.value.versionId);
      }
      if(added.length)await writeReferences(kind,[...new Set([...existing,...added])]);
    }catch(e){setError(creativeError(e,'素材导入失败'));}finally{lock.current=false;setBusy(false);}
  };
  const props=definition?inputProperties(definition):{},promptField=definition?inputField(definition,'prompt'):'prompt',prompt=String(input?.values[promptField]??input?.prompt??'');
  const h3=definition?.id===H3_CREATIVE_WORKFLOW_ID,durationField=definition?inputField(definition,'duration'):'duration',resolutionField=definition?inputField(definition,'resolution'):'resolution';
  const resolution=String(input?.values[resolutionField]??''),duration=input?.values[durationField];
  const requiredPrompt=Boolean(props[promptField]&&(definition?.inputs.required as string[]|undefined)?.includes(promptField));
  const ready=generationReadiness({provider:'AutoDL',busy,pending:false,unknown:false,connected:accountReady,missingPrompt:requiredPrompt&&!prompt.trim()});
  const extraFields=Object.keys(props).filter(field=>field!==promptField&&field!==inputField(definition!,'images')&&field!==inputField(definition!,'audios')&&(!h3||![durationField,resolutionField].includes(field)));
  const quickFields=h3?[]:extraFields.filter(field=>field!==inputField(definition!,'seed')).slice(0,3),settingsFields=extraFields.filter(field=>!quickFields.includes(field));
  const parameterDefinition=definition?{...definition,ui:{sections:[{id:'parameters',title:'',fields:settingsFields}]}}:undefined;
  const quickDefinition=definition?{...definition,ui:{sections:[{id:'quick',title:'',fields:quickFields}]}}:undefined;
  const openSheet=(next:Sheet)=>{Keyboard.dismiss();setAssist(false);if(next==='account'){router.push({pathname:'/settings-panel',params:{section:'accounts',requestId:createId(),surface:'video-draft',draftId:draft?.id}});return;}setSheet(next);};
  const mediaGroup=(kind:'image'|'audio')=>{
    if(!definition)return null;
    const rows=references.filter(ref=>(ref.slot==='audio')===(kind==='audio')),rules=mediaConstraints(definition,kind==='image'?'images':'audios'),label=kind==='image'?'参考图':'参考音频';
    if(!rules.maximum&&!rows.length)return null;
    return <VideoReferenceCards active={view==='create'&&!assist&&!sheet&&!picking} kind={kind} rows={rows} minimum={rules.minimum??0} maximum={rules.maximum??0} editable={editable&&!saving} onPreview={setPreview} onReplace={ids=>void replaceReferences(kind,ids).catch(()=>undefined)} onAdd={()=>Alert.alert(`添加${label}`,'选择来源',[{text:'从设备导入',onPress:()=>void importReference(kind)},{text:'从素材库选择',onPress:()=>setPicking(kind)},{text:'取消',style:'cancel'}])}/>;
  };
  const hasResults=Boolean(resultDraft?.job_id),displayResult=view==='result'&&hasResults;
  return <SafeAreaView edges={embedded?[]:['top','bottom','left','right']} style={s.screen}><KeyboardSurface style={{flex:1}}>
    {!embedded?<View style={v.header}><IconAction label="返回" icon="arrow_back" disabled={busy||saving} onPress={()=>{if(!closePanel())router.canGoBack()?router.back():router.replace('/(tabs)/create');}}/><Text style={[v.label,{flex:1}]}>视频创作</Text><IconAction label="创作账号" icon="key" onPress={()=>openSheet('account')}/></View>:null}
    <WorkbenchScope draft={draft}/>
    {hasResults?<View style={{flexDirection:'row',paddingHorizontal:12,gap:16}}>{(['create','result'] as const).map(tab=><Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab==='create'?(pending?'准备下一次':'创作'):'生成记录'} accessibilityState={{selected:view===tab}} onPress={()=>setView(tab)} style={[v.tab,view===tab&&{borderBottomColor:COLORS.primary}]}><Text style={[v.caption,view===tab&&{color:COLORS.primary,fontWeight:'600'}]}>{tab==='create'?(pending?'准备下一次':'创作'):'生成记录'}</Text></Pressable>)}</View>:null}
    {conflict?<View style={v.notice}><Text style={s.error}>草稿已在其他入口更新，本页输入已保留。</Text><TextAction label="载入最新草稿" disabled={busy||saving} onPress={()=>Alert.alert('载入最新草稿','这会放弃本页尚未保存的修改。',[{text:'保留本页',style:'cancel'},{text:'载入最新',onPress:()=>void reload().catch(e=>setError(creativeError(e)))}])}/></View>:null}
    {error || workflowError?<View style={v.notice}><Text accessibilityRole="alert" style={s.error}>{error || workflowError}</Text><TextAction label={dirty?'重试保存输入':'重新读取工作区'} disabled={busy||saving} onPress={()=>void (dirty?save():reload()).catch(e=>setError(creativeError(e)))}/></View>:null}
    <View style={{flex:1,minHeight:0}} onLayout={e=>setBodyHeight(e.nativeEvent.layout.height)}><View style={{flex:1,display:displayResult?'none':'flex'}}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="none" contentContainerStyle={v.content}>
      <View style={s.row}><Text style={v.caption}>工作流</Text><View style={{flexShrink:1}}><TextAction label={definition?`${h3?'MiniMax H3':definition.metadata.title} · ${entries.filter(item=>!item.reason).length>1?'切换':'详情'}`:'选择视频工作流'} disabled={busy||saving} onPress={()=>openSheet('workflow')}/></View></View>
      <AutodlWalletPanel summary/>
      {stale?<View style={{gap:4}}><Text style={s.error}>工作流版本已变化，原输入已保留。对齐后可继续生成。</Text><TextAction label="对齐当前工作流版本" disabled={busy||saving} onPress={()=>{const current=entries.find(item=>item.record.workflowId===draft?.workflow_id);if(current)void switchWorkflow(current);}}/></View>:null}

      {!accountReady?<TextAction label="连接 AutoDL 创作账号" onPress={()=>openSheet('account')}/>:null}
      {notice?<View><Text accessibilityLiveRegion="polite" style={v.caption}>{notice}</Text>{undoDraft?<TextAction label="撤销工作流切换" disabled={busy||saving} onPress={()=>{const rowId=undoDraft;void creativeService().draft(rowId).then(row=>{const target=entries.find(item=>item.record.workflowId===row?.workflow_id);if(target)void switchWorkflow(target,rowId);});}}/>:null}</View>:null}
      {status==='UNKNOWN'&&pending&&resultDraft?.job_id?<TextAction label="核查与继续创作" onPress={()=>router.push({pathname:'/creative-task/[id]',params:{id:resultDraft.job_id!,returnToWorkbench:'1'}})}/>:null}
      {pending?<Text accessibilityLiveRegion="polite" style={v.caption}>本次{status==='UNKNOWN'?'结果待核查':'正在生成'} · 下面的修改用于下一次创作</Text>:null}
      {mediaGroup('image')}{mediaGroup('audio')}
      {props[promptField]?<View style={{gap:6}}><View style={s.row}><Text style={v.label}>动作与运镜</Text><TextAction label="帮我写提示词" disabled={!editable} onPress={()=>{Keyboard.dismiss();setSheet(undefined);setPicking(undefined);setAssist(true);}}/></View><TextInput accessibilityLabel="视频镜头提示词" placeholder="描述主体的动作、镜头如何运动，以及希望保留的细节…" placeholderTextColor={COLORS.textMuted} value={prompt} onChangeText={value=>update(promptField,value)} editable={editable} multiline style={[s.input,v.prompt]}/></View>:null}
      {h3?<View style={v.quick}><SegmentedChoices label="视频方向" options={[{id:'横',label:'横屏'},{id:'竖',label:'竖屏'}]} value={resolution.slice(-1)} disabled={!editable} onChange={value=>{const next=resolution.slice(0,-1)+value;if(props[resolutionField]?.enum?.includes(next))update(resolutionField,next);}}/><SegmentedChoices label="视频清晰度" options={[{id:'480p',label:'480p'},{id:'768p',label:'768p'}]} value={resolution.slice(0,-1)} disabled={!editable} onChange={value=>{const next=value+resolution.slice(-1);if(props[resolutionField]?.enum?.includes(next))update(resolutionField,next);}}/><Pressable accessibilityRole="button" accessibilityLabel="选择视频时长" onPress={()=>{setCustomDuration(![5,10,15].includes(Number(duration)));openSheet('duration');}} disabled={!editable} style={v.chip}><Text style={v.chipText}>{String(duration)} 秒⌄</Text></Pressable>{settingsFields.length?<TextAction label="更多设置" onPress={()=>openSheet('settings')}/>:null}</View>:<>{quickDefinition&&quickFields.length?<WorkflowForm compact definition={quickDefinition} value={input?.values??{}} disabled={!editable} onChange={changeValues}/>:null}{settingsFields.length?<TextAction label="更多设置" onPress={()=>openSheet('settings')}/>:null}</>}
      {undo?<View style={s.row}><Text style={v.caption}>已应用助手建议</Text><TextAction label="撤销提示词修改" onPress={()=>{setInput(undo);setUndo(undefined);}}/></View>:null}
    </ScrollView></View>
    {resultDraft?<View style={{flex:displayResult?1:0,display:displayResult?'flex':'none'}}><VideoGenerationHistory onEdit={()=>setView('create')} draft={resultDraft} visible={displayResult} disabled={busy||saving} onLatestStatus={setStatus}/></View>:null}
    {assist&&input?<ImageEditorDrawer expanded fill height={bodyHeight} summary={null} onExpand={()=>{}} onCollapse={()=>{Keyboard.dismiss();setAssist(false);}}><PromptAssistSheet sessionId={`video:${initialId}`} workspaceId={`video:${input.sessionId}:${definition?.id??draft?.workflow_id}`} disabled={!editable} workflow={definition?.id} workflowTitle={definition?.metadata.title} prompt={prompt} kind="video" onApply={value=>{setUndo(input);update(promptField,value);}} onClose={()=>{Keyboard.dismiss();setAssist(false);}}/></ImageEditorDrawer>:null}
    </View>
    <View style={[v.footer,assist||displayResult?{display:'none'}:undefined]}>{displayResult?<Pressable accessibilityRole="button" accessibilityLabel={pending?'准备下一次':'调整后再生成'} onPress={()=>setView('create')} style={v.primary}><Text style={v.primaryText}>{pending?'准备下一次':'调整后再生成'}</Text></Pressable>:<View testID="video-generate-row" style={{flexDirection:'row',alignItems:'stretch',backgroundColor:COLORS.primary,borderRadius:6,overflow:'hidden'}}><Pressable accessibilityRole="button" accessibilityLabel="生成视频" disabled={!editable||!ready.canSubmit||saving||conflict} onPress={()=>void submit()} style={[v.primary,{flex:1,minWidth:0,paddingHorizontal:8},(!editable||busy||saving||conflict||!accountReady||requiredPrompt&&!prompt.trim())&&{opacity:.5}]}><Text style={v.primaryText}>{busy?'处理中…':props[durationField]?`生成 ${String(duration??'')} 秒视频`:'生成视频'}</Text></Pressable>{h3?<VideoCostHint inline enabled resolution={resolution} duration={duration}/>:null}</View>}
      <Text accessibilityLiveRegion="polite" style={v.status}>{saving?'正在保存输入…':dirty?'输入待保存':pending?'已提交内容固定 · 下一次输入自动保存':'输入自动保存'}</Text>
    </View>
    {sheet==='workflow'&&focused?<ParameterSheet title="视频工作流" description="选择已接入的视频能力" onClose={()=>setSheet(undefined)}>{entries.map(item=><View key={item.record.workflowId}><RecordRow title={item.definition.metadata.title} detail={item.reason || `${mediaConstraints(item.definition,'images').maximum?`参考图 ≤ ${mediaConstraints(item.definition,'images').maximum} 张`:'无需图片'}${mediaConstraints(item.definition,'audios').maximum?` · 音频 ≤ ${mediaConstraints(item.definition,'audios').maximum} 段`:''}`} selected={item.record.workflowId===draft?.workflow_id} disabled={Boolean(item.reason)||busy||saving} onPress={()=>{if(item.record.workflowId===draft?.workflow_id)setSheet(undefined);else void switchWorkflow(item);}} trailing={<IconAction label={`工作流详情：${item.definition.metadata.title}`} icon={workflowDetail===item.record.workflowId?'expand_less':'info'} onPress={()=>setWorkflowDetail(workflowDetail===item.record.workflowId?undefined:item.record.workflowId)}/>}/>{workflowDetail===item.record.workflowId?<Text style={[v.caption,{padding:8}]}>{item.definition.metadata.description || '视频生成'} · v{item.record.version}</Text>:null}</View>)}{!entries.length?<Text style={v.caption}>没有已安装的视频工作流</Text>:null}<TextAction label="管理与同步工作流" onPress={()=>{router.push({pathname:'/settings-panel',params:{section:'workflows',requestId:createId(),surface:'video-workflow'}});}}/></ParameterSheet>:null}
    {(sheet==='orientation'||sheet==='quality')&&input?<ParameterSheet title={sheet==='orientation'?'画面方向':'清晰度'} onClose={()=>setSheet(undefined)}><SegmentedChoices label={sheet==='orientation'?'视频方向':'视频清晰度'} options={sheet==='orientation'?[{id:'横',label:'横屏'},{id:'竖',label:'竖屏'}]:[{id:'480p',label:'480p'},{id:'768p',label:'768p'}]} value={sheet==='orientation'?resolution.slice(-1):resolution.slice(0,-1)} disabled={!editable} onChange={value=>{const next=sheet==='orientation'?`${resolution.slice(0,-1)}${value}`:`${value}${resolution.slice(-1)}`;if(props[resolutionField]?.enum?.includes(next)){update(resolutionField,next);setSheet(undefined);}}}/></ParameterSheet>:null}
    {sheet==='duration'?<ParameterSheet title="视频时长" onClose={()=>setSheet(undefined)}><SegmentedChoices label="常用视频时长" options={[{id:'5',label:'5 秒'},{id:'10',label:'10 秒'},{id:'15',label:'15 秒'},{id:'custom',label:'自定义'}]} value={customDuration?'custom':String(duration)} disabled={!editable} onChange={value=>{setCustomDuration(value==='custom');if(value!=='custom'){update(durationField,Number(value));setSheet(undefined);}}}/>{customDuration?<><Text style={v.caption}>1–15 秒</Text><NovelAiNumberField label="视频时长" value={Number(duration)} editable={editable} onChange={value=>{if(value!==null)update(durationField,value);}}/></>:null}</ParameterSheet>:null}
    {sheet==='settings'&&parameterDefinition?<ParameterSheet title="更多视频设置" onClose={()=>setSheet(undefined)}><WorkflowForm compact definition={parameterDefinition} value={input?.values??{}} disabled={!editable} onChange={changeValues}/></ParameterSheet>:null}

    {picking?<CreativeAssetPicker kind={picking} purpose="reference" target="当前视频创作" projectId={draft?.project_id??undefined} onClose={()=>setPicking(undefined)} onChoose={version=>replaceReferences(picking,[...references.filter(ref=>(ref.slot==='audio')===(picking==='audio')).map(ref=>ref.version_id).filter(id=>id!==version.id),version.id])}/>:null}
    {preview?<ImagePreview uri={preview} onClose={()=>setPreview(undefined)}/>:null}
  </KeyboardSurface></SafeAreaView>;
}
const v=StyleSheet.create({
  header:{flexDirection:'row',alignItems:'center',paddingHorizontal:6,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:COLORS.border},content:{padding:12,gap:10,paddingBottom:24,maxWidth:760,width:'100%',alignSelf:'center'},
  label:{fontSize:14,fontWeight:'600',color:COLORS.text},caption:{fontSize:12,lineHeight:18,color:COLORS.textMuted},notice:{paddingHorizontal:12,paddingVertical:6,gap:4},prompt:{minHeight:132,textAlignVertical:'top',fontSize:15,lineHeight:23,padding:12},
  quick:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center'},chip:{paddingHorizontal:12,minHeight:40,justifyContent:'center',borderWidth:1,borderColor:COLORS.border,borderRadius:6,backgroundColor:COLORS.surface},chipText:{fontSize:13,color:COLORS.text},
  thumb:{width:64,height:64,borderRadius:6,backgroundColor:COLORS.surfaceRaised,alignItems:'center',justifyContent:'center'},add:{width:48,height:64,borderRadius:6,borderWidth:1,borderStyle:'dashed',borderColor:COLORS.controlBorder,alignItems:'center',justifyContent:'center'},
  tab:{minHeight:36,justifyContent:'center',borderBottomWidth:2,borderBottomColor:'transparent',paddingHorizontal:4},
  footer:{paddingHorizontal:12,paddingVertical:8,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:COLORS.border,gap:4,backgroundColor:COLORS.surface},primary:{minHeight:44,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.primary,borderRadius:6},primaryText:{color:COLORS.onPrimary,fontWeight:'700',fontSize:14},status:{fontSize:11,lineHeight:16,color:COLORS.textMuted,textAlign:'center'},
});
