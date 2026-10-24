import { useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { creativeService, importCreativeImage } from './runtime';
import { novelAiDraftInput, novelAiModelName, type NovelAiDraftInput } from './novelAiProtocol';
import { prepareCreativeImage, confirmCreativeImage } from './novelAiRuntime';
import { creativeError } from './creativeError';
import { useDraftSync } from './useDraftSync';
import { CreativeResults } from './CreativeResults';
import { DraftHeading } from './DraftHeading';
import { CreativeAccountPanel } from './CreativeAccountPanel';
import { CreativeAssetPicker } from './CreativeAssetPicker';
import { NovelAiPromptEditor } from './NovelAiPromptEditor';
import { NovelAiSettings } from './NovelAiSettings';
import { NovelAiMaskEditor } from './NovelAiMaskEditor';
import { NovelAiEnhancePanel } from './NovelAiEnhancePanel';
import type { CreativeDraft } from './drafts';
import { createId } from '../ids';
import { pickImagesFromGallery } from '../native/imagePicker';
import { ListAction } from '../ui/ListPageUI';
import { AppIcon } from '../ui/icons';
import { COLORS } from '../ui/theme';
import { ParameterSheet, SectionHeading, SegmentedChoices, TextAction } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';

export function ImageDraftScreen({ id }: { id: string }) {
  const router=useRouter(), navigation=useNavigation();
  const [draft,setDraft]=useState<CreativeDraft>(), [input,setInput]=useState<NovelAiDraftInput>();
  const [busy,setBusy]=useState(false), [saving,setSaving]=useState(false), [error,setError]=useState('');
  const [editor,setEditor]=useState<string>(), [settings,setSettings]=useState(false), [account,setAccount]=useState(false), [picking,setPicking]=useState<'source'|'mask'>();
  const [refs,setRefs]=useState<Array<{version_id:string;relative_path:string;state:string}>>([]);
  const scrollRef=useRef<ScrollView>(null), lock=useRef(false), latest=useRef(input); latest.current=input;
  const dirty=Boolean(input && draft && JSON.stringify(input)!==draft.input_json), editable=draft?.state==='EDITING' && !busy;
  usePreventRemove(dirty || busy || saving,({data})=>{
    if(lock.current){Alert.alert('操作进行中','请等待保存或提交完成。');return;}
    Alert.alert('修改尚未保存','是否放弃本次未保存修改？',[{text:'继续编辑',style:'cancel'},{text:'放弃并离开',style:'destructive',onPress:()=>navigation.dispatch(data.action)}]);
  });
  const load=async(canApply=()=>true)=>{const row=await creativeService().draft(id);if(!row)throw new Error('草稿不存在');const parsed=novelAiDraftInput.parse(JSON.parse(row.input_json));if(canApply()){setDraft(row);setInput(parsed);}};
  const {conflict,reload,assertCurrent}=useDraftSync(id,draft,dirty,busy || saving,load,setError);
  useEffect(()=>{let active=true;if(draft)void creativeService().draftInputs(id).then(rows=>{if(active)setRefs(rows);}).catch(()=>{if(active)setError('底图读取失败，请重新打开草稿');});return()=>{active=false;};},[id,draft?.revision]);
  useEffect(()=>{if(error || conflict)scrollRef.current?.scrollTo({y:0,animated:true});},[error,conflict]);
  const save=async()=>{
    if(lock.current || conflict || !draft || !latest.current || draft.state!=='EDITING')return;
    lock.current=true;setSaving(true);setError('');
    try{await assertCurrent();await creativeService().execute({name:'draft.updateImage',payload:{id,expectedRevision:draft.revision,input:latest.current}},createId());const row=await creativeService().draft(id);if(row)setDraft(row);}
    catch(e){setError(creativeError(e,'保存失败'));}finally{lock.current=false;setSaving(false);}
  };
  useEffect(()=>{if(!dirty || busy || saving || error || conflict)return;const timer=setTimeout(()=>void save(),600);return()=>clearTimeout(timer);},[input,draft,dirty,busy,saving,error,conflict]);
  const update=(patch:Partial<NovelAiDraftInput>)=>{setInput(old=>old?{...old,...patch}:old);setError('');};
  const submit=async()=>{
    if(lock.current || !draft || !latest.current || draft.state!=='EDITING')return;lock.current=true;setBusy(true);setError('');
    const release=()=>{lock.current=false;setBusy(false);};
    try{
      await assertCurrent();
      if(dirty){await creativeService().execute({name:'draft.updateImage',payload:{id,expectedRevision:draft.revision,input:latest.current}},createId());const row=await creativeService().draft(id);if(row)setDraft(row);}
      const preview=await prepareCreativeImage(id), count=latest.current.samples;
      const enhancing = Boolean(latest.current.enhancement || latest.current.enhance);
      Alert.alert(enhancing ? '确认增强图片' : `确认生成 ${count} 张图片`,`使用 ${novelAiModelName(latest.current.model)} ${enhancing ? `增强图片，倍率 ${latest.current.enhancement?.scale ?? 'Max'}，强度 ${latest.current.strength}，噪声 ${latest.current.noise}` : `生成 ${count} 张图片`}。\n\n费用暂不可预估，Opus 不代表所有参数均免费。本次授权 1 次请求（含 ${count} 张图片），15 分钟内有效。结果不明时不会自动重发。`,[
        {text:'取消',style:'cancel',onPress:release},
        {text:enhancing?'授权并增强':'授权并生成',onPress:()=>{void confirmCreativeImage(preview).then(()=>load()).catch(e=>setError(creativeError(e,'提交失败'))).finally(release);}},
      ],{cancelable:false});
    }catch(e){setError(creativeError(e,'准备失败'));release();}
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
  if(draft?.state==='SUBMITTED')return <SafeAreaView style={s.screen}>
    <View style={{paddingHorizontal:16}}><DraftHeading draft={draft} dirty={dirty} busy={busy || saving} title="图片创作" /></View>
    <CreativeResults draft={draft} disabled={busy || saving || dirty} dock />
  </SafeAreaView>;
  return <SafeAreaView style={s.screen}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
    <View style={{paddingHorizontal:16,paddingBottom:8}}><DraftHeading draft={draft} dirty={dirty} busy={busy || saving} title={input?.enhancement || input?.enhance?"细节增强":"图片工作台"} /></View>
    <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:16,flexGrow:1}}>
      {conflict?<View style={s.card}><Text style={s.body}>草稿在其他入口更新，本页输入已保留。</Text><TextAction label="载入最新草稿" disabled={busy || saving} onPress={()=>Alert.alert('载入最新草稿','这会放弃本页尚未保存的修改。',[{text:'保留本页',style:'cancel'},{text:'载入最新',onPress:()=>void reload().catch(e=>setError(e.message))}])} /></View>:null}
      {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
      {input?<View style={s.row}><TextAction label={`${novelAiModelName(input.model)}${input.model==='nai-diffusion-5-full'?` · ${input.effort==='high'?'High':'Medium'}`:''}`} onPress={()=>setSettings(true)} /><Text style={s.muted}>{input.width} × {input.height}{input.transparent?' · 透明':''}</Text></View>:null}
      {draft && (draft.job_id || draft.target_asset_id && !input?.enhancement)?<CreativeResults draft={draft} disabled={busy || saving || dirty} />:sourceUri && input?.action!=='generate'?<View style={{flex:input?.enhancement?undefined:1,gap:8}}><Image accessibilityLabel="底图预览" source={{uri:sourceUri}} resizeMode="contain" style={{width:'100%',...(input?.enhancement?{height:180}:{flex:1,minHeight:300}),backgroundColor:COLORS.mediaBackground,borderRadius:18}} /><Text style={s.muted}>{input?.enhancement?'当前选中的原图 · 增强后保存为新版本':input?.action==='infill'?'局部重绘 · 打开底图编辑蒙版':'图生图 · 调整描述后生成新画面'}</Text></View>:<View style={{flex:1,minHeight:280,alignItems:'center',justifyContent:'center',padding:24,gap:16,borderRadius:20,backgroundColor:COLORS.surfaceRaised}}>
        <View style={{width:72,height:88,borderRadius:12,backgroundColor:COLORS.surface,alignItems:'center',justifyContent:'center',transform:[{rotate:'-7deg'}]}}><AppIcon name="image" size={36} color={COLORS.primaryActive} /></View>
        <Text style={[s.title,{fontSize:24}]}>让想象成为画面</Text><Text style={[s.muted,{textAlign:'center'}]}>在下方描述你想看到的场景，或添加底图继续创作。</Text>
        <TextAction label="添加底图" onPress={()=>setEditor('references')} icon="add" disabled={!editable} />
      </View>}
      {input?.enhancement && draft?.state==='EDITING'?<NovelAiEnhancePanel input={input} update={update} editable={editable} />:null}
    </ScrollView>
    {input && draft?.state==='EDITING'?<View style={[s.footer,{paddingHorizontal:16,paddingTop:8,gap:4,borderTopLeftRadius:20,borderTopRightRadius:20}]}>
      <View style={s.row}><TextAction label="画面描述" onPress={()=>setEditor('prompt')} icon="edit" />{input.enhancement?<Text numberOfLines={1} style={[s.muted,{flex:1}]}>{input.prompt}</Text>:<View style={{flexDirection:'row',gap:12}}><TextAction label={`角色${input.characters.filter(c=>c.enabled).length?` ${input.characters.filter(c=>c.enabled).length}`:''}`} onPress={()=>setEditor('characters')} /><TextAction label={input.action==='generate'?'底图':input.action==='img2img'?'图生图':'局部重绘'} onPress={()=>setEditor('references')} /></View>}</View>
      {!input.enhancement?<TextInput accessibilityLabel="图片提示词" placeholder="描述画面，或点「画面描述」展开完整编辑…" placeholderTextColor={COLORS.textMuted} value={input.prompt} onChangeText={prompt=>update({prompt})} editable={editable} multiline style={[s.input,{minHeight:64,maxHeight:100,paddingTop:10,textAlignVertical:'top',backgroundColor:COLORS.surfaceRaised,borderWidth:0}]} />:null}
      <View style={[s.row,{flexWrap:'nowrap',gap:16}]}><TextAction label="生成设置" icon="tune" onPress={()=>setSettings(true)} /><View style={{flex:1}}><ListAction label={busy?'处理中…':input.enhancement || input.enhance?'增强图片':`生成 ${input.samples} 张图片`} disabled={busy || saving || conflict} onPress={()=>void submit()} /></View></View>
      <View style={s.row}><Text style={[s.muted,{fontSize:12}]}>NovelAI · 费用待确认</Text><TextAction label="创作账号" onPress={()=>setAccount(true)} /></View>
    </View>:null}
    {input && settings?<NovelAiSettings input={input} update={update} editable={editable} onClose={()=>setSettings(false)} />:null}
    {input && editor && !picking?<NovelAiPromptEditor input={input} update={update} editable={editable} tab={editor} setTab={setEditor} onClose={()=>setEditor(undefined)} references={references} />:null}
    {picking?<CreativeAssetPicker kind="image" projectId={draft?.project_id??undefined} onClose={()=>setPicking(undefined)} onChoose={async version=>choose(version.id,picking)} />:null}
    {account?<ParameterSheet title="创作账号" onClose={()=>setAccount(false)}><CreativeAccountPanel /></ParameterSheet>:null}
  </KeyboardAvoidingView></SafeAreaView>;
}
