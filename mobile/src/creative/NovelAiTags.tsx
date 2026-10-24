import { useRef, useState } from 'react';
import { NativeModules, Text, TextInput, View } from 'react-native';
import { creativeAccounts } from './accountRuntime';
import { TextAction } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';

export function NovelAiTags({ model, onChoose, disabled }: { model: string; onChoose: (tag: string) => void; disabled: boolean }) {
  const [query,setQuery]=useState(''), [tags,setTags]=useState<string[]>([]), [notice,setNotice]=useState(''), [busy,setBusy]=useState(false);
  const lock=useRef(false), generation=useRef(0);
  const search=async()=>{
    if(lock.current || !query.trim())return;lock.current=true;setBusy(true);setNotice('');const current=generation.current;
    try{
      const accounts=creativeAccounts(), account=(await accounts.list()).find(a=>a.provider_id==='novelai');
      if(!account)throw new Error('请先在创作账号中连接 NovelAI');
      const credential=await accounts.resolveExact(account.credential_generation_id);
      if(!NativeModules.AutoDLMedia?.suggestNovelAiTags)throw new Error('请安装支持标签查询的新版 Android 应用');
      const body=JSON.parse(await NativeModules.AutoDLMedia.suggestNovelAiTags(model,query.trim(),credential.token));
      if(!Array.isArray(body.tags))throw new Error('标签响应无法识别');
      const result=body.tags.filter((t:unknown):t is {tag:string}=>Boolean(t && typeof t==='object' && typeof (t as {tag?:unknown}).tag==='string')).map((t:{tag:string})=>t.tag).filter((t:string)=>t.length>0 && t.length<=200).slice(0,12);
      if(current===generation.current){setTags(result);if(!result.length)setNotice('没有匹配标签，试试其他英文或日文关键词。');}
    }catch{if(current===generation.current)setNotice('标签查询失败，请检查账号和网络。描述仍可直接使用。');}
    finally{lock.current=false;setBusy(false);}
  };
  return <View style={{gap:6}}><TextInput accessibilityLabel="标签关键词" placeholder="查找官方标签，例如 telescope" value={query} maxLength={100} editable={!disabled} onChangeText={value=>{setQuery(value);generation.current++;setTags([]);setNotice('');}} style={s.input} />
    <TextAction label={busy?'正在查找标签…':'查找官方标签'} disabled={disabled || busy || !query.trim()} onPress={()=>void search()} />
    <View style={s.row}>{tags.map(tag=><TextAction key={tag} label={`添加标签 ${tag}`} disabled={disabled} onPress={()=>onChoose(tag)} />)}</View>{notice?<Text style={s.muted}>{notice}</Text>:null}
  </View>;
}
