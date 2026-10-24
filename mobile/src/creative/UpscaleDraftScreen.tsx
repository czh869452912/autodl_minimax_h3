import {useEffect,useRef,useState} from 'react';
import {Alert,Image,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import {useRouter} from 'expo-router';
import {usePreventRemove} from 'expo-router/react-navigation';
import {creativeService} from './runtime';
import type {CreativeDraft} from './drafts';
import {prepareCreativeImage,confirmCreativeImage} from './novelAiRuntime';
import {CreativeResults} from './CreativeResults';
import {CreativeAccountPanel} from './CreativeAccountPanel';
import {DraftHeading} from './DraftHeading';
import {ParameterSheet,TextAction} from './WorkbenchUI';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from './creativeUI';
import {creativeError} from './creativeError';
export function UpscaleDraftScreen({id}:{id:string}){
  const [draft,setDraft]=useState<CreativeDraft>(),[source,setSource]=useState<string>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[account,setAccount]=useState(false);
  const lock=useRef(false),mounted=useRef(true),router=useRouter();
  usePreventRemove(busy,()=>Alert.alert('操作进行中','请先完成或取消超分确认。'));
  const load=async()=>{const row=await creativeService().draft(id);if(!row)throw new Error('草稿不存在');const refs=await creativeService().draftInputs(id);if(mounted.current){setDraft(row);setSource(refs[0]?.state==='AVAILABLE'?`${FileSystem.documentDirectory}${refs[0].relative_path}`:undefined);}};
  useEffect(()=>{mounted.current=true;void load().catch(e=>{if(mounted.current)setError(e.message);});return()=>{mounted.current=false;};},[id]);
  const submit=async()=>{
    if(lock.current || draft?.state!=='EDITING')return;lock.current=true;setBusy(true);setError('');
    const release=()=>{lock.current=false;if(mounted.current)setBusy(false);};
    try{
      const preview=await prepareCreativeImage(id),size=preview.prepared.inputSnapshot as {width:number;height:number};
      Alert.alert('确认图片超分',`${size.width} × ${size.height} → ${size.width*2} × ${size.height*2}\n\n使用 NovelAI 独立超分，保留原图并新增版本。费用暂不可预估，本次授权 1 次请求；结果不明时不会自动重发。`,[
        {text:'取消',style:'cancel',onPress:release},{text:'授权并超分',onPress:()=>{void confirmCreativeImage(preview).then(load).catch(e=>{if(mounted.current)setError(creativeError(e,'超分提交失败'));}).finally(release);}},
      ],{cancelable:false});
    }catch(e){if(mounted.current)setError(creativeError(e,'超分准备失败'));release();}
  };
  if(draft?.state==='SUBMITTED')return <SafeAreaView style={s.screen}><View style={{paddingHorizontal:16}}><DraftHeading draft={draft} title="放大结果" busy={busy} dirty={false} /></View><CreativeResults draft={draft} disabled={busy} dock /></SafeAreaView>;
  return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={{padding:16,gap:16}}>
    <DraftHeading draft={draft} title="图片超分" busy={busy} dirty={false} />
    {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
    <Text style={s.title}>清晰放大 · 2×</Text><Text style={s.body}>放大宽高各 2 倍，保持画面内容。最多接收 3,145,728 像素原图，不会修改原图或自动替换项目采用的版本。</Text>
    {draft?.state==='EDITING'?<>{source?<Image accessibilityLabel="超分原图" source={{uri:source}} resizeMode="contain" style={[s.preview,{height:360}]} />:<Text style={s.muted}>原图待恢复，请到素材详情恢复原件。</Text>}<ListAction label={busy?'处理中…':'超分此图片'} disabled={busy || !source} onPress={()=>void submit()} /></>:null}
    <TextAction label="创作账号" disabled={busy} onPress={()=>setAccount(true)} /><TextAction label="返回内容管理" disabled={busy} onPress={()=>router.push('/(tabs)/assets')} />
  </ScrollView>{account?<ParameterSheet title="创作账号" onClose={()=>setAccount(false)}><CreativeAccountPanel /></ParameterSheet>:null}</SafeAreaView>;
}
