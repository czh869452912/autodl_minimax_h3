import {useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {creativeService} from './runtime';
import {ImageDraftScreen} from './ImageDraftScreen';
import {UpscaleDraftScreen} from './UpscaleDraftScreen';
import {creativeUI as s} from './creativeUI';
import {TextAction} from './WorkbenchUI';
export function CreativeImageDraftRouter({id}:{id:string}){
  const [operation,setOperation]=useState<{id:string;upscale:boolean}>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setError('');void creativeService().draft(id).then(row=>{if(!row)throw new Error('草稿不存在');if(active)setOperation({id,upscale:JSON.parse(row.input_json).operation==='upscale'});}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,retry]);
  if(error)return <View style={s.card}><Text style={s.error}>{error}</Text><TextAction label="重新读取草稿" onPress={()=>setRetry(retry+1)} /></View>;
  if(operation?.id!==id)return <Text style={s.muted}>正在读取草稿…</Text>;
  return operation.upscale?<UpscaleDraftScreen key={id} id={id} />:<ImageDraftScreen key={id} id={id} />;
}
