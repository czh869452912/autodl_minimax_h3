import {useRef,useState} from 'react';
import {Alert,Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {creativeService} from './runtime';
import {createId} from '../ids';
import {ListAction} from '../ui/ListPageUI';
import {COLORS} from '../ui/theme';
export function CopySubmittedDraft({id}:{id:string}){
  const router=useRouter(),lock=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <View style={{gap:8}}><ListAction label="复制为新草稿（不立即生成）" secondary disabled={busy} onPress={()=>Alert.alert('准备新的生成草稿','旧任务可能已经消费。新草稿保留参数与输入版本；种子留空时将重新随机。后续生成必须重新授权，可能重复消费。',[{text:'取消',style:'cancel'},{text:'复制草稿',onPress:()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');void creativeService().execute({name:'draft.copySubmitted',payload:{id}},createId()).then(r=>{if(r.status==='completed')router.push({pathname:r.value.provider==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:r.value.draftId}});}).catch(e=>setError(e.message)).finally(()=>{lock.current=false;setBusy(false);});}}])}/>{error?<Text accessibilityRole="alert" style={{color:COLORS.danger}}>{error}</Text>:null}</View>;
}
