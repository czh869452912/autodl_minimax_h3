import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CreativeHome } from '../../src/creative/CreativeHome';
import { parseOpenCreativeRequest } from '../../src/creative/openCreativeRequest';
import { createPromptDraftStore } from '../../src/handoff/promptDraft';
import { getDatabase } from '../../src/storage/databaseClient';

export default function CreateScreen() {
  const params=useLocalSearchParams<Record<string,string|string[]>>(),router=useRouter();
  const [error,setError]=useState('');
  const prompt=Array.isArray(params.prompt)?params.prompt[0]:params.prompt;
  const converting=useRef<string|undefined>(undefined);
  useEffect(()=>{
    if(!prompt||params.draftId||converting.current===prompt)return;
    converting.current=prompt;
    void createPromptDraftStore(getDatabase()).save({prompt,attachmentIds:[]}).then(draft=>router.setParams({prompt:undefined,draftId:draft.id})).catch(()=>setError('旧提示词读取失败，请重新打开链接'));
  },[prompt,params.draftId,router]);
  return <View style={{flex:1}}>{error?<Text accessibilityRole="alert">{error}</Text>:null}<CreativeHome opening={!!prompt && !params.draftId} openRequest={parseOpenCreativeRequest(params)} onRequestConsumed={()=>router.setParams({draftId:undefined,creativeDraftId:undefined,mode:undefined,intent:undefined,requestId:undefined,prompt:undefined})}/></View>;
}
