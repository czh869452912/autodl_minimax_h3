import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { creativeService, importCreativeImage } from './runtime';
import { defaultNovelAiDraft, novelAiDraftInput, novelAiModelName, type NovelAiDraftInput } from './novelAiProtocol';
import { prepareCreativeImage, confirmCreativeImage } from './novelAiRuntime';
import { prepareImageEnhancement, createImageProcessingDraft } from './imageProcessing';
import { persistImageWorkbenchInput } from './imageWorkbenchSession';
import { creativeError } from './creativeError';
import { useDraftSync } from './useDraftSync';
import { CreativeResults } from './CreativeResults';
import { CreativeAccountPanel } from './CreativeAccountPanel';
import { CreativeAssetPicker } from './CreativeAssetPicker';
import { NovelAiPromptEditor } from './NovelAiPromptEditor';
import { NovelAiSettings } from './NovelAiSettings';
import { NovelAiMaskEditor } from './NovelAiMaskEditor';
import { NovelAiEnhancePanel } from './NovelAiEnhancePanel';
import type { CreativeDraft } from './drafts';
import type { AssetVersion } from './types';
import { pickImagesFromGallery } from '../native/imagePicker';
import { COLORS } from '../ui/theme';
import { CompactWorkbench, IconAction, ParameterSheet, SectionHeading, SegmentedChoices, TextAction } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';

const normalInput=(input:NovelAiDraftInput):NovelAiDraftInput=>input.enhancement || input.enhance
  ? {...input,action:'generate',enhance:false,enhancement:null,sourceVersionId:null,maskVersionId:null,maskStrokes:[]}:input;

export function ImageDraftScreen({id}:{id:string}) { return <CompactWorkbench><ImageCanvas initialId={id} /></CompactWorkbench>; }

function ImageCanvas({initialId}:{initialId:string}) {
  const router=useRouter(),navigation=useNavigation();
  const [id,setId]=useState(initialId),[draft,setDraft]=useState<CreativeDraft>(),[input,setInput]=useState<NovelAiDraftInput>(),[baseline,setBaseline]=useState('');
  const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[jobStatus,setJobStatus]=useState('');
  const [editor,setEditor]=useState<string>(),[settings,setSettings]=useState(false),[account,setAccount]=useState(false),[picking,setPicking]=useState<'source'|'mask'>();
  const [currentVersion,setCurrentVersion]=useState<AssetVersion>(),[historySignal,setHistorySignal]=useState(0);
  const [processing,setProcessing]=useState<'enhance'|'upscale'>(),[enhanceInput,setEnhanceInput]=useState<NovelAiDraftInput>(),[processingSource,setProcessingSource]=useState<AssetVersion>();
  const [refs,setRefs]=useState<Array<{version_id:string;relative_path:string;state:string}>>([]);
  const lock=useRef(false),latest=useRef(input);latest.current=input;
  const dirty=Boolean(input && baseline && JSON.stringify(input)!==baseline);
  const pending=Boolean(draft?.job_id && (!jobStatus || ['VALIDATING','READY_TO_SUBMIT','SUBMITTING','QUEUED','RUNNING','UNKNOWN'].includes(jobStatus)));
  const editable=Boolean(draft && !busy && !pending);
  usePreventRemove(dirty || busy || saving,({data})=>{
    if(lock.current){Alert.alert('操作进行中','请等待保存或提交完成。');return;}
    Alert.alert('修改尚未保存','是否放弃本次未保存修改？',[{text:'继续编辑',style:'cancel'},{text:'放弃并离开',style:'destructive',onPress:()=>navigation.dispatch(data.action)}]);
  });
  const adopt=useCallback((row:CreativeDraft)=>{setId(row.id);setDraft(row);},[]);
  const load=async(canApply=()=>true)=>{
    const row=await creativeService().draft(id);if(!row)throw new Error('草稿不存在');
    const parsed=novelAiDraftInput.safeParse(JSON.parse(row.input_json));
    if(canApply()) {
      setDraft(row);
      const next=parsed.success?normalInput(parsed.data):latest.current??defaultNovelAiDraft;
      setInput(next);setBaseline(JSON.stringify(next));
      if(row.state==='EDITING' && parsed.success && parsed.data.enhancement){setEnhanceInput(parsed.data);setProcessing('enhance');}
    }
  };
  const {conflict,reload,assertCurrent}=useDraftSync(id,draft,dirty,busy || saving,load,setError);
  useEffect(()=>{let active=true;if(draft)void creativeService().draftInputs(id).then(rows=>{if(active)setRefs(rows);}).catch(()=>{if(active)setError('底图读取失败，请重新打开草稿');});return()=>{active=false;};},[id,draft?.revision]);
  const save=async()=>{
    if(lock.current || conflict || !dirty || !draft || !latest.current)return;
    lock.current=true;setSaving(true);setError('');
    const snapshot=latest.current;
    try{await assertCurrent();await persistImageWorkbenchInput(draft,snapshot,adopt,currentVersion?.id);setBaseline(JSON.stringify(snapshot));}
    catch(e){setError(creativeError(e,'保存失败'));}finally{lock.current=false;setSaving(false);}
  };
  useEffect(()=>{if(!dirty || busy || saving || error || conflict || pending)return;const timer=setTimeout(()=>void save(),600);return()=>clearTimeout(timer);},[input,draft,dirty,busy,saving,error,conflict,pending]);
  const update=(patch:Partial<NovelAiDraftInput>)=>{setInput(old=>old?{...old,...patch}:old);setError('');};
  const activeInput=processing==='enhance' && enhanceInput?enhanceInput:input;
  const updateActive=(patch:Partial<NovelAiDraftInput>)=>{
    if(processing==='enhance')setEnhanceInput(old=>old?{...old,...patch}:old);
    else update(patch);
  };
  const closeProcessing=()=>{Keyboard.dismiss();setProcessing(undefined);};
  const closeSettings=()=>{Keyboard.dismiss();setSettings(false);};
  const openProcessing=useCallback(async(version:AssetVersion,operation:'enhance'|'upscale')=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{if(operation==='enhance')setEnhanceInput(await prepareImageEnhancement(version));setProcessingSource(version);setProcessing(operation);setSettings(false);}
    catch(e){setError(creativeError(e,'无法打开图片工具'));}finally{lock.current=false;setBusy(false);}
  },[]);
  const submit=async()=>{
    if(lock.current || !draft || !latest.current || pending || conflict)return;
    Keyboard.dismiss();
    lock.current=true;setBusy(true);setError('');
    try {
      await assertCurrent();
      const snapshot=latest.current;
      let requestDraft:CreativeDraft;
      if(processing==='upscale') {
        if(!processingSource)throw new Error('请重新选择要放大的图片');
        const result=await createImageProcessingDraft(processingSource,'upscale',{projectId:draft.project_id??undefined,shotId:draft.shot_id??undefined});
        if(result.status!=='completed')throw new Error('无法准备放大请求');
        const row=await creativeService().draft(result.value.draftId);if(!row)throw new Error('放大草稿读取失败');requestDraft=row;adopt(row);
      } else {
        const requestInput=processing==='enhance'?enhanceInput:snapshot;
        if(!requestInput)throw new Error('增强参数未准备好');
        requestDraft=await persistImageWorkbenchInput(draft,requestInput,adopt,currentVersion?.id);
      }
      // Clicking the manual action authorizes this one prepared request; no modal or reusable grant.
      const preview=await prepareCreativeImage(requestDraft.id);
      await confirmCreativeImage(preview);
      const submitted=await creativeService().draft(requestDraft.id);
      if(submitted)adopt(submitted);
      setBaseline(JSON.stringify(snapshot));setJobStatus('QUEUED');setProcessing(undefined);setEnhanceInput(undefined);setSettings(false);
    } catch(e){setError(creativeError(e,'提交失败'));}
    finally{lock.current=false;setBusy(false);}
  };
  const choose=(versionId:string,kind:'source'|'mask')=>update(kind==='source'?{sourceVersionId:versionId,enhancement:null,enhance:false,maskVersionId:null,maskStrokes:[],action:input?.action==='infill'?'infill':'img2img'}:{maskVersionId:versionId,maskStrokes:[]});
  const importImage=async(kind:'source'|'mask')=>{
    if(lock.current || !editable)return;lock.current=true;setBusy(true);
    try{const [image]=await pickImagesFromGallery(1);if(image){const result=await importCreativeImage(image,draft?.project_id??undefined);if(result.status==='completed')choose(result.value.versionId,kind);}}
    catch(e){setError(creativeError(e,'图片导入失败'));}finally{lock.current=false;setBusy(false);}
  };
  const source=refs.find(r=>r.version_id===input?.sourceVersionId), mask=refs.find(r=>r.version_id===input?.maskVersionId);
  const sourceUri=source?.state==='AVAILABLE'?`${FileSystem.documentDirectory}${source.relative_path}`:undefined;
  const references=input?<View style={{gap:12}}>
    <SectionHeading title="生成方式" />
    <SegmentedChoices label="生成方式" options={[{id:'generate',label:'文字生图'},{id:'img2img',label:'图生图'},{id:'infill',label:'局部重绘'}]} value={input.action} disabled={!editable} onChange={action=>update({action,enhance:action==='img2img' && input.enhance,enhancement:action==='img2img'?input.enhancement:null})} />
    {input.action!=='generate'?<>
      <Text style={s.muted}>选择底图，输出尺寸与变化强度可在生成设置中调整。</Text>
      {sourceUri?<Image accessibilityLabel="当前底图" source={{uri:sourceUri}} resizeMode="contain" style={[s.preview,{height:180}]} />:<Text style={s.muted}>{input.sourceVersionId?'底图保存或恢复中…':'尚未选择底图'}</Text>}
      <View style={s.row}><TextAction label="从素材选择底图" disabled={!editable || saving} onPress={()=>setPicking('source')} /><TextAction label="导入底图" disabled={!editable} onPress={()=>void importImage('source')} /></View>
      {input.action==='infill'?<>
        {input.model==='nai-diffusion-5-curated'?<Text style={s.error}>V5 Curated 没有原生重绘模型，请切换 V5 Full 后使用局部重绘。</Text>:null}
        {input.maskVersionId?<><Text style={s.muted}>已选择蒙版 · 白色重绘，黑色保留</Text>{mask?.state==='AVAILABLE'?<Image source={{uri:`${FileSystem.documentDirectory}${mask.relative_path}`}} style={[s.preview,{height:140}]} resizeMode="contain" />:null}<TextAction label="改为绘制蒙版" disabled={!editable} onPress={()=>update({maskVersionId:null})} /></>:sourceUri?<NovelAiMaskEditor uri={sourceUri} input={input} disabled={!editable} onChange={maskStrokes=>update({maskStrokes,maskVersionId:null})} />:null}
        <View style={s.row}><TextAction label="从素材选择蒙版" disabled={!editable || saving} onPress={()=>setPicking('mask')} /><TextAction label="导入黑白蒙版" disabled={!editable} onPress={()=>void importImage('mask')} /></View>
      </>:null}
    </>:<Text style={s.muted}>从文字开始创作。V5 的底图支持图生图与局部重绘；Vibe 和 Precise Reference 不适用于 V5。</Text>}
  </View>:null;
  return <SafeAreaView style={s.screen}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
    <View style={c.header}><IconAction label="返回" icon="arrow_back" disabled={busy || saving} onPress={()=>router.canGoBack()?router.back():router.replace('/(tabs)/create')} /><Text style={c.headerTitle}>图片创作</Text><Text numberOfLines={1} style={c.caption}>{input?novelAiModelName(input.model):'读取中…'}</Text><IconAction label="创作账号" icon="key" onPress={()=>setAccount(true)} /></View>
    {conflict?<View style={c.notice}><Text style={s.error}>草稿已在其他入口更新，本页输入已保留。</Text><TextAction label="载入最新草稿" disabled={busy || saving} onPress={()=>Alert.alert('载入最新草稿','这会放弃本页尚未保存的修改。',[{text:'保留本页',style:'cancel'},{text:'载入最新',onPress:()=>void reload().catch(e=>setError(e.message))}])} /></View>:null}
    {error?<View style={c.notice}><Text accessibilityRole="alert" style={s.error}>{error}</Text>{dirty?<TextAction label="重试保存草稿" disabled={busy || saving} onPress={()=>void save()} />:null}</View>:null}
    <View style={{flex:1}}>
      <View style={{flex:1,display:settings?'none':'flex'}}>{draft?<CreativeResults draft={draft} canvas disabled={busy || saving || pending} onCurrentVersion={setCurrentVersion} onJobStatus={setJobStatus} onEnhance={version=>void openProcessing(version,'enhance')} onUpscale={version=>void openProcessing(version,'upscale')} historySignal={historySignal} />:null}</View>
      {settings && activeInput?<NovelAiSettings inline input={activeInput} update={updateActive} editable={editable} onClose={closeSettings} />:null}
      {!settings && processing?<ScrollView keyboardShouldPersistTaps="handled" style={c.toolOverlay} contentContainerStyle={{flexGrow:1}}>
        {processing==='enhance' && enhanceInput?<NovelAiEnhancePanel input={enhanceInput} editable={!busy && !pending} update={patch=>setEnhanceInput(old=>old?{...old,...patch}:old)} onClose={closeProcessing} />:processing==='upscale'?<View style={c.toolCard}><View style={s.row}><Text style={{color:COLORS.text,fontWeight:'600'}}>清晰放大 · 2×</Text><IconAction label="关闭放大" icon="close" onPress={closeProcessing} disabled={busy} /></View><Text style={c.caption}>宽高各放大 2 倍，保留原图并新增版本。</Text></View>:null}
      </ScrollView>:null}
    </View>
    {input?<View style={c.composer}>
      {!settings && processing!=='upscale'?<View style={c.promptRow}><TextInput accessibilityLabel="图片提示词" placeholder="描述画面…" placeholderTextColor={COLORS.textMuted} value={activeInput?.prompt} onChangeText={prompt=>updateActive({prompt})} editable={editable} multiline style={c.prompt} /><IconAction label="展开画面编辑" icon="expand_more" onPress={()=>setEditor('prompt')} /></View>:null}
      <View style={c.generateRow}><IconAction label="生成设置" icon="tune" disabled={processing==='upscale'} selected={settings} onPress={()=>setSettings(!settings)} /><Pressable accessibilityRole="button" accessibilityLabel={processing==='enhance'?'增强图片':processing==='upscale'?'放大图片':`生成 ${input.samples} 张图片`} disabled={busy || saving || pending || conflict} onPress={()=>void submit()} style={({pressed})=>[c.generate,(busy || saving || pending || conflict) && {opacity:0.5},pressed && {opacity:0.75}]}><Text style={c.generateText}>{busy?'处理中…':jobStatus==='UNKNOWN'?'请核查原任务':pending?'生成中…':processing==='enhance'?'Enhance':processing==='upscale'?'放大 2×':`生成 ${input.samples} 张图片`}</Text></Pressable><IconAction label="生成历史" icon="list_alt" disabled={!currentVersion} onPress={()=>{setSettings(false);setHistorySignal(value=>value+1);}} /></View>
      <Text style={c.cost}>点击即生成 · 可能消耗 Anlas</Text>
    </View>:null}
    {activeInput && editor && !picking?<NovelAiPromptEditor input={activeInput} update={updateActive} editable={editable} tab={editor} setTab={setEditor} onClose={()=>setEditor(undefined)} description={processing==='enhance'?'调整本次增强使用的提示词与角色':'提示词、角色与底图自动保存在本草稿'} references={processing==='enhance'?<Text style={s.muted}>使用打开 Enhance 时选中的原图。关闭增强后可切换生成方式。</Text>:references} />:null}
    {picking?<CreativeAssetPicker kind="image" projectId={draft?.project_id??undefined} onClose={()=>setPicking(undefined)} onChoose={async version=>choose(version.id,picking)} />:null}
    {account?<ParameterSheet title="创作账号" onClose={()=>setAccount(false)}><CreativeAccountPanel /></ParameterSheet>:null}
  </KeyboardAvoidingView></SafeAreaView>;
}

const c=StyleSheet.create({
  header:{flexDirection:'row',alignItems:'center',paddingHorizontal:6,minHeight:44,gap:6,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:COLORS.border},
  headerTitle:{fontSize:15,fontWeight:'600',color:COLORS.text,flex:1},
  caption:{fontSize:12,lineHeight:18,color:COLORS.textMuted},
  notice:{paddingHorizontal:12,paddingVertical:6},
  composer:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:COLORS.border,backgroundColor:COLORS.surface,paddingHorizontal:8,paddingTop:4,paddingBottom:4,gap:2},
  promptRow:{flexDirection:'row',alignItems:'center',paddingLeft:4},
  prompt:{flex:1,height:52,minHeight:52,maxHeight:52,textAlignVertical:'top',fontSize:13,lineHeight:18,color:COLORS.text,paddingVertical:8,paddingHorizontal:4},
  generateRow:{flexDirection:'row',alignItems:'center',gap:6},
  generate:{flex:1,minHeight:40,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.primary,borderRadius:6,paddingHorizontal:10},
  generateText:{fontSize:14,fontWeight:'700',color:COLORS.onPrimary},
  cost:{fontSize:10,lineHeight:14,color:COLORS.textMuted,textAlign:'center'},
  toolOverlay:{position:'absolute',left:12,right:12,bottom:8,maxHeight:'86%'},
  toolCard:{padding:12,gap:8,borderWidth:1,borderColor:COLORS.border,borderRadius:8,backgroundColor:COLORS.surface},
});
