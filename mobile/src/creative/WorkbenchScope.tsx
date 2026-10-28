import {useEffect,useState} from 'react';
import {Pressable,Text} from 'react-native';
import {useRouter} from 'expo-router';
import type {CreativeDraft} from './drafts';
import {creativeService} from './runtime';
import {COLORS} from '../ui/theme';

export function WorkbenchScope({draft}:{draft?:CreativeDraft}){
  const router=useRouter(),[label,setLabel]=useState('项目创作');
  useEffect(()=>{
    if(!draft?.project_id)return;
    let active=true;const projectId=draft.project_id,shotId=draft.shot_id;
    void (async()=>{const service=creativeService();const [project,shots]=await Promise.all([service.project(projectId),shotId?service.shots(projectId):Promise.resolve([])]);if(active)setLabel([project?.title??'项目创作',shots.find(s=>s.id===shotId)?.title].filter(Boolean).join(' / '));})().catch(()=>{if(active)setLabel(draft.shot_id?'项目创作 / 已关联镜头':'项目创作');});
    return()=>{active=false;};
  },[draft?.project_id,draft?.shot_id]);
  if(!draft?.project_id)return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`打开所属项目：${label}`} onPress={()=>router.push({pathname:'/creative-project/[id]',params:{id:draft.project_id!,...(draft.shot_id?{tab:'shots',shotId:draft.shot_id}:{})}})} style={{paddingHorizontal:12,paddingVertical:5}}><Text numberOfLines={1} style={{fontSize:12,color:COLORS.textMuted}}>{label}</Text></Pressable>;
}
