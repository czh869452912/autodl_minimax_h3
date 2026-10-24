import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ParameterSheet, TextAction } from './WorkbenchUI';
import { ListAction } from '../ui/ListPageUI';
import { creativeUI as s } from './creativeUI';
import { suggestCreativePrompt } from './promptSuggestion';

export function PromptAssistSheet({prompt,kind,onApply,onClose}:{prompt:string;kind:'image'|'video';onApply:(value:string)=>void;onClose:()=>void}) {
  const router=useRouter(), original=useRef(prompt), controller=useRef<AbortController|null>(null), mounted=useRef(true);
  const [instruction,setInstruction]=useState(''),[suggestion,setSuggestion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
  const suggest=async()=>{
    if(controller.current)return;
    const request=new AbortController();controller.current=request;setBusy(true);setError('');
    try{const value=await suggestCreativePrompt({prompt:original.current,instruction,kind},request.signal);if(mounted.current)setSuggestion(value);}
    catch{if(mounted.current && !request.signal.aborted)setError('暂时无法获取建议，请检查助手模型设置后重试。');}
    finally{controller.current=null;if(mounted.current)setBusy(false);}
  };
  const changed=prompt!==original.current;
  return <ParameterSheet title="帮我写提示词" fullScreen onClose={onClose}>
    <Text style={s.muted}>助手只提供文字建议。应用后，由你调整参数并点击生成。</Text>
    <Text style={s.title}>当前描述</Text><Text selectable style={s.body}>{original.current || '尚未填写'}</Text>
    <TextInput accessibilityLabel="提示词修改方向" placeholder="例如：改成水彩风格，强化月光和远景层次" value={instruction} onChangeText={setInstruction} maxLength={4000} editable={!busy} multiline style={[s.input,{minHeight:100}]} />
    <TextAction label={busy?'正在构思…':suggestion?'重新建议':'获取提示词建议'} disabled={busy} onPress={()=>void suggest()} />
    {suggestion?<View style={{gap:12}}><Text style={s.title}>建议提示词</Text><TextInput accessibilityLabel="助手建议提示词" value={suggestion} onChangeText={setSuggestion} maxLength={10000} multiline style={[s.input,{minHeight:180}]} /><ListAction label="应用到当前草稿" disabled={busy || changed || !suggestion.trim()} onPress={()=>{onApply(suggestion);onClose();}} /></View>:null}
    {changed?<Text accessibilityRole="alert" style={s.error}>原描述已在其他入口修改，请关闭后重新获取建议。</Text>:null}
    {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
    <TextAction label="助手模型设置" onPress={()=>{onClose();router.push({pathname:'/(tabs)/settings',params:{section:'assistant'}});}} />
  </ParameterSheet>;
}
