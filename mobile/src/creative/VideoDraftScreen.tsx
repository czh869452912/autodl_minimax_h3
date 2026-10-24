import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { useRouter, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { creativeService, creativeFiles, importCreativeImage } from './runtime';
import { videoDraftInput, type CreativeDraft } from './drafts';
import type { z } from 'zod';
import { createId } from '../ids';
import { COLORS } from '../ui/theme';
import { RESOLUTION_OPTIONS } from '../create/resolutions';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CreativeResults } from './CreativeResults';
import { CreativeAssetPicker } from './CreativeAssetPicker';
import { creativeUI as s } from './creativeUI';
import { pickImagesFromGallery } from '../native/imagePicker';
import { CreativeAccountPanel } from './CreativeAccountPanel';
import { prepareCreativeVideo, confirmCreativeVideo } from './videoRuntime';
import { PromptAssistSheet } from './PromptAssistSheet';
import { CompactWorkbench, IconAction, ParameterSheet, SectionHeading, SegmentedChoices, TextAction, useWorkbenchLeave } from './WorkbenchUI';
import { creativeError } from './creativeError';
import { useDraftSync } from './useDraftSync';
import { persistVideoWorkbenchInput } from './imageWorkbenchSession';
import { rememberWorkbenchDraft, workbenchResultDraft } from './workbenchSessions';
import { NovelAiNumberField } from './NovelAiNumberField';
import { WorkbenchScope } from './WorkbenchScope';

export function VideoDraftScreen({id,embedded=false}:{id:string;embedded?:boolean}){return <CompactWorkbench><VideoCanvas initialId={id} embedded={embedded} /></CompactWorkbench>;}
function VideoCanvas({initialId,embedded}:{initialId:string;embedded:boolean}) {
  const router=useRouter(),navigation=useNavigation();
  const [id,setId]=useState(initialId),[draft,setDraft]=useState<CreativeDraft>(),[resultDraft,setResultDraft]=useState<CreativeDraft>();
  const [input,setInput]=useState<z.output<typeof videoDraftInput>>(),[baseline,setBaseline]=useState('');
  const [references,setReferences]=useState<Awaited<ReturnType<ReturnType<typeof creativeService>['draftInputs']>>>([]);
  const [settings,setSettings]=useState(false),[refsOpen,setRefsOpen]=useState(false),[picking,setPicking]=useState(false),[editor,setEditor]=useState(false),[assist,setAssist]=useState(false),[account,setAccount]=useState(false);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[status,setStatus]=useState(''),[historySignal,setHistorySignal]=useState(0),[undoPrompt,setUndoPrompt]=useState<string>();
  const lock=useRef(false),latest=useRef(input);latest.current=input;
  const dirty=Boolean(input && baseline && JSON.stringify(input)!==baseline),editable=Boolean(draft && !busy);
  const pending=Boolean((resultDraft??draft)?.job_id && (!status || ['VALIDATING','READY_TO_SUBMIT','SUBMITTING','QUEUED','RUNNING','UNKNOWN'].includes(status)));
  const closePanel=useCallback(()=>{if(account){setAccount(false);return true;}if(picking){setPicking(false);return true;}if(assist){setAssist(false);return true;}if(editor){setEditor(false);return true;}if(refsOpen){setRefsOpen(false);return true;}if(settings){Keyboard.dismiss();setSettings(false);return true;}return false;},[account,picking,assist,editor,refsOpen,settings]);
  useFocusEffect(useCallback(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',closePanel);return()=>sub.remove();},[closePanel]));
  usePreventRemove(dirty || busy || saving || settings,({data})=>{if(closePanel())return;if(lock.current){Alert.alert('正在保存','请等待本次操作完成。');return;}Alert.alert('修改尚未保存','是否放弃本次未保存修改？',[{text:'继续编辑',style:'cancel'},{text:'放弃并离开',style:'destructive',onPress:()=>navigation.dispatch(data.action)}]);});
  const adopt=useCallback((row:CreativeDraft)=>{setId(row.id);setDraft(row);void rememberWorkbenchDraft(row).catch(()=>undefined);},[]);
  const load=async(canApply=()=>true)=>{
    const service=creativeService(),row=await service.draft(id);if(!row)throw new Error('草稿不存在');
    const parsed=videoDraftInput.parse(JSON.parse(row.input_json)),refs=await service.draftInputs(id);
    for(const ref of refs)await creativeFiles().verify(ref.version_id);
    const checked=await service.draftInputs(id),output=await workbenchResultDraft(row);
    if(canApply()){adopt(row);setInput(parsed);setBaseline(JSON.stringify(parsed));setReferences(checked);setResultDraft(output);}
  };
  const {conflict,reload,assertCurrent}=useDraftSync(id,draft,dirty,busy || saving,load,setError);
  const save=async()=>{
    if(lock.current || conflict || !draft || !latest.current)return false;
    if(!dirty)return true;
    lock.current=true;setSaving(true);setError('');const snapshot=latest.current;
    try{await assertCurrent();await persistVideoWorkbenchInput(draft,snapshot,adopt);setBaseline(JSON.stringify(snapshot));return true;}
    catch(e){setError(creativeError(e,'草稿未保存'));return false;}
    finally{lock.current=false;setSaving(false);}
  };
  useWorkbenchLeave(async()=>!lock.current && !conflict && (!dirty || await save()));
  useEffect(()=>{if(!dirty || busy || saving || error || conflict)return;const timer=setTimeout(()=>void save(),600);return()=>clearTimeout(timer);},[input,draft,dirty,busy,saving,error,conflict]);
  const update=(patch:Partial<z.output<typeof videoDraftInput>>)=>{setInput(value=>value?{...value,...patch}:value);setError('');};
  const submit=async()=>{
    if(lock.current || !draft || !latest.current || conflict || pending)return;
    Keyboard.dismiss();lock.current=true;setBusy(true);setError('');const snapshot=latest.current;
    let requestId:string|undefined;
    try{
      await assertCurrent();const request=await persistVideoWorkbenchInput(draft,snapshot,adopt);
      requestId=request.id;
      const preview=await prepareCreativeVideo(request.id);await confirmCreativeVideo(preview);
      const row=await creativeService().draft(request.id);if(!row)throw new Error('任务已提交，请在任务中心核查');
      adopt(row);setResultDraft(row);setBaseline(JSON.stringify(snapshot));setStatus('QUEUED');setSettings(false);
    }catch(e){setError(creativeError(e,'提交失败'));if(requestId)try{const row=await creativeService().draft(requestId);if(row?.state==='SUBMITTED'){adopt(row);setResultDraft(row);setStatus('UNKNOWN');}}catch{/* Keep the original request for recovery. */}}finally{lock.current=false;setBusy(false);}
  };
  const writeReferences=async(versionIds:string[])=>{
    if(!draft || !latest.current)throw new Error('工作区未就绪');
    await assertCurrent();const snapshot=latest.current,row=await persistVideoWorkbenchInput(draft,snapshot,adopt);
    await creativeService().execute({name:'draft.replaceInputs',payload:{id:row.id,expectedRevision:row.revision,versionIds}},createId());
    const saved=await creativeService().draft(row.id);if(!saved)throw new Error('参考图保存失败');
    adopt(saved);setBaseline(JSON.stringify(snapshot));setReferences(await creativeService().draftInputs(row.id));
  };
  const replaceReferences=async(versionIds:string[])=>{
    if(lock.current || conflict)throw new Error('请等待保存完成');lock.current=true;setBusy(true);setError('');
    try{await writeReferences(versionIds);}catch(e){setError(creativeError(e,'参考图保存失败'));throw e;}finally{lock.current=false;setBusy(false);}
  };
  const importReference=async()=>{
    if(lock.current || !draft || conflict || references.length>=9)return;lock.current=true;setBusy(true);setError('');
    try{const [image]=await pickImagesFromGallery(1);if(image){const result=await importCreativeImage(image,draft.project_id??undefined);if(result.status==='completed')await writeReferences([...references.map(r=>r.version_id).filter(id=>id!==result.value.versionId),result.value.versionId]);}}
    catch(e){setError(creativeError(e,'参考图导入失败'));}finally{lock.current=false;setBusy(false);}
  };
  const first=references[0];
  const referenceActions=<><View style={s.row}><TextAction label="从素材选择" disabled={!editable || saving || references.length>=9} onPress={()=>setPicking(true)} /><TextAction label="导入参考图" disabled={!editable || saving || references.length>=9} onPress={()=>void importReference()} /></View>{references.map((ref,index)=><View key={ref.version_id} style={s.row}>{ref.state==='AVAILABLE'?<Image accessibilityLabel={`参考图 ${index+1}`} source={{uri:`${FileSystem.documentDirectory}${ref.relative_path}`}} style={{width:56,height:56,borderRadius:5}} />:null}<Text style={s.muted}>参考图 {index+1}{ref.state!=='AVAILABLE'?' · 原件待恢复':''}</Text><TextAction label={`移除参考图 ${index+1}`} disabled={!editable || saving} onPress={()=>void replaceReferences(references.filter(r=>r!==ref).map(r=>r.version_id)).catch(()=>undefined)} /></View>)}</>;
  return <SafeAreaView edges={embedded?[]:['top','bottom','left','right']} style={s.screen}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
    {!embedded?<View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:6,borderBottomWidth:1,borderBottomColor:COLORS.border}}><IconAction label="返回" icon="arrow_back" disabled={busy || saving} onPress={()=>{if(!closePanel())router.canGoBack()?router.back():router.replace('/(tabs)/create');}} /><Text style={[s.title,{flex:1,fontSize:15}]}>视频创作</Text><Text style={s.muted}>H3</Text><IconAction label="创作账号" icon="key" onPress={()=>setAccount(true)} /></View>:null}
    <WorkbenchScope draft={draft} />
    {conflict?<View style={{paddingHorizontal:12}}><Text style={s.error}>草稿已在其他入口更新，本页输入已保留。</Text><TextAction label="载入最新草稿" disabled={busy || saving} onPress={()=>Alert.alert('载入最新草稿','这会放弃本页尚未保存的修改。',[{text:'保留本页',style:'cancel'},{text:'载入最新',onPress:()=>void reload().catch(e=>setError(e.message))}])} /></View>:null}
    {error?<View style={{paddingHorizontal:12,paddingVertical:4}}><Text accessibilityRole="alert" style={s.error}>{error}</Text>{dirty?<TextAction label="重试保存草稿" disabled={busy || saving} onPress={()=>void save()} />:null}</View>:null}
    <View style={{flex:1,display:settings?'none':'flex'}}>{(resultDraft??draft)?.target_asset_id || (resultDraft??draft)?.job_id?draft?<CreativeResults draft={resultDraft??draft} canvas disabled={busy || saving || pending} onJobStatus={setStatus} historySignal={historySignal} />:null:first?.state==='AVAILABLE'?<Pressable style={{flex:1,padding:12}} accessibilityRole="button" accessibilityLabel="管理参考图" onPress={()=>setRefsOpen(true)}><Image source={{uri:`${FileSystem.documentDirectory}${first.relative_path}`}} resizeMode="contain" style={{flex:1,width:'100%'}} /></Pressable>:<View style={{flex:1,alignItems:'center',justifyContent:'center',gap:6,padding:16}}><Text style={s.muted}>描述动作与运镜，或添加参考图</Text>{referenceActions}</View>}</View>
    {settings && input?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:12,gap:12}}><View style={s.row}><SectionHeading title="视频设置" /><IconAction label="关闭视频设置" icon="close" onPress={()=>setSettings(false)} /></View><SectionHeading title="画质与方向" /><SegmentedChoices label="视频画质与方向" options={RESOLUTION_OPTIONS.map(resolution=>({id:resolution,label:resolution}))} value={input.resolution} disabled={!editable} onChange={resolution=>update({resolution})} /><SectionHeading title="时长" detail="1–15 秒" /><SegmentedChoices label="常用视频时长" options={[{id:'5',label:'5 秒'},{id:'10',label:'10 秒'},{id:'15',label:'15 秒'}]} value={String(input.duration)} disabled={!editable} onChange={value=>update({duration:Number(value)})} /><NovelAiNumberField label="视频时长" value={input.duration} editable={editable} onChange={duration=>{if(duration!==null)update({duration});}} /><SectionHeading title="随机种子" detail="留空则随机" /><TextInput accessibilityLabel="视频种子" placeholder="Seed" keyboardType="number-pad" value={input.seed} editable={editable} onChangeText={seed=>update({seed})} style={s.input} /></ScrollView>:null}
    {input?<View style={{borderTopWidth:1,borderTopColor:COLORS.border,paddingHorizontal:8,paddingVertical:4,gap:2,backgroundColor:COLORS.surface}}>
      {!settings?<View style={{flexDirection:'row',alignItems:'center'}}><TextInput accessibilityLabel="视频镜头提示词" placeholder="描述动作与运镜…" multiline scrollEnabled={false} value={input.prompt} editable={editable} onChangeText={prompt=>update({prompt})} style={{flex:1,height:52,fontSize:13,lineHeight:18,padding:8,textAlignVertical:'top',color:COLORS.text}} /><IconAction label="帮我写提示词" icon="smart_toy" disabled={!editable} onPress={()=>setAssist(true)} /><IconAction label="展开视频描述" icon="expand_more" onPress={()=>setEditor(true)} /></View>:null}
      {!settings?<Pressable accessibilityRole="button" accessibilityLabel="管理参考图" onPress={()=>setRefsOpen(true)}><Text style={[s.muted,{fontSize:12}]}>H3 · {input.resolution} · {input.duration} 秒 · 参考图 {references.length}</Text></Pressable>:null}
      {undoPrompt!==undefined?<TextAction label="撤销提示词修改" onPress={()=>{update({prompt:undoPrompt});setUndoPrompt(undefined);}} />:null}
      <View style={{flexDirection:'row',gap:6,alignItems:'center'}}><IconAction label="视频设置" icon="tune" selected={settings} onPress={()=>setSettings(!settings)} /><Pressable accessibilityRole="button" accessibilityLabel="生成视频" disabled={busy || saving || conflict || pending} onPress={()=>void submit()} style={{flex:1,minHeight:40,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.primary,borderRadius:6,opacity:busy || saving || conflict || pending?0.5:1}}><Text style={{color:COLORS.onPrimary,fontWeight:'700',fontSize:14}}>{busy?'处理中…':status==='UNKNOWN'?'请核查原任务':pending?'生成中…':'生成视频'}</Text></Pressable><IconAction label="生成历史" icon="list_alt" disabled={!(resultDraft??draft)?.target_asset_id} onPress={()=>{setSettings(false);setHistorySignal(n=>n+1);}} /></View>
      <Text accessibilityLiveRegion="polite" style={{fontSize:10,lineHeight:14,color:COLORS.textMuted,textAlign:'center'}}>{saving?'正在保存输入…':dirty?'输入待保存':pending?'生成中可继续编辑下一镜头，完成后再提交':'点击即生成 1 个视频 · 费用暂无法估算'}</Text>
    </View>:null}
    {refsOpen?<ParameterSheet title={`参考图 · ${references.length}/9`} onClose={()=>setRefsOpen(false)}>{referenceActions}</ParameterSheet>:null}
    {editor && input?<ParameterSheet fullScreen title="动作与运镜" onClose={()=>setEditor(false)}><TextInput accessibilityLabel="完整视频描述" multiline value={input.prompt} editable={editable} onChangeText={prompt=>update({prompt})} style={[s.input,{minHeight:160,textAlignVertical:'top'}]} /></ParameterSheet>:null}
    {assist && input?<PromptAssistSheet prompt={input.prompt} kind="video" onApply={prompt=>{setUndoPrompt(input.prompt);update({prompt});}} onClose={()=>setAssist(false)} />:null}
    {picking?<CreativeAssetPicker kind="image" projectId={draft?.project_id??undefined} onClose={()=>setPicking(false)} onChoose={v=>replaceReferences([...references.map(r=>r.version_id).filter(id=>id!==v.id),v.id])} />:null}
    {account?<ParameterSheet title="创作账号" onClose={()=>setAccount(false)}><CreativeAccountPanel provider="autodl" /></ParameterSheet>:null}
  </KeyboardAvoidingView></SafeAreaView>;
}
