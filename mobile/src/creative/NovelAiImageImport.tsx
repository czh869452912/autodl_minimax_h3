import {useEffect,useState} from 'react';
import {Image,NativeModules,Text,View} from 'react-native';
import type {NativeImageAsset} from '../native/imagePicker';
import type {NovelAiDraftInput} from './novelAiProtocol';
import {recoverNovelAiMetadata} from './novelAiMetadata';
import {defaultMetadataSelection,metadataImportPatch} from './novelAiMetadataImport';
import {ParameterSheet,TextAction} from './WorkbenchUI';
import {NovelAiToggle} from './NovelAiSettings';
import {creativeUI as s} from './creativeUI';
export function NovelAiImageImport({image,input,onApply,onUseImage,onClose}:{image:NativeImageAsset;input:NovelAiDraftInput;onApply:(patch:Partial<NovelAiDraftInput>)=>void;onUseImage:()=>Promise<void>;onClose:()=>void}){
  const [selection,setSelection]=useState(defaultMetadataSelection),[recovered,setRecovered]=useState<ReturnType<typeof recoverNovelAiMetadata>>(),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;void (async()=>{
    const native=NativeModules.AutoDLMedia;
    // Picker content/cache URIs must use the import reader, not the CAS-only inspector.
    const raw=await native?.readCreativePngMetadata?.(image.uri);
    if(active)setRecovered(recoverNovelAiMetadata(raw??{}));
  })().catch(()=>{if(active)setError('未能读取内嵌元数据，仍可作为底图使用。');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[image.uri]);
  return <ParameterSheet fullScreen title="使用导入图片" description="选择作为底图，或只恢复生成信息" onClose={()=>{if(!busy)onClose();}}>
    <Image source={{uri:image.uri}} resizeMode="contain" style={{width:'100%',height:200,borderRadius:10}}/>
    <TextAction label={busy?'正在导入…':'用作图生图底图'} disabled={busy||loading} onPress={()=>{setBusy(true);void onUseImage().then(onClose).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}/>
    {loading?<Text style={s.muted}>正在读取图片元数据…</Text>:recovered?.input?<>
      <Text style={s.title}>图片包含 NovelAI 生成信息</Text><Text style={s.muted}>勾选需要填入当前草稿的内容，导入后可继续修改。</Text>
      {([['prompt','Prompt · 正向提示词'],['negative','UC · 负面提示词'],['characters',`Characters · ${recovered.input.characters.length} 个角色`],['append','追加角色（保留现有角色）'],['settings','Settings · 生成设置'],['seed','Seed · 随机种子'],['clean','清理已识别的质量与负面预设']] as const).map(([key,label])=><NovelAiToggle key={key} label={label} value={selection[key]} disabled={busy||key==='append'&&!selection.characters} onChange={value=>setSelection(old=>({...old,[key]:value}))}/>)}
      {selection.settings?<Text style={s.muted}>{recovered.input.width} × {recovered.input.height} · {recovered.input.steps} 步 · {recovered.input.sampler}</Text>:null}
      <TextAction label="导入所选元数据" disabled={busy||!['prompt','negative','characters','settings','seed'].some(k=>selection[k as keyof typeof selection])} onPress={()=>{try{onApply(metadataImportPatch(input,recovered.input!,selection));onClose();}catch(e){setError(e instanceof Error?e.message:'参数无法导入');}}}/>
    </>:<Text style={s.muted}>未找到可恢复的 NovelAI 生成信息，可将图片用作底图。</Text>}
    {recovered?.notices.map((notice,i)=><Text key={i} style={s.muted}>{notice}</Text>)}
    {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
  </ParameterSheet>;
}
