import {useState} from 'react';
import {Image,Pressable,Text,View} from 'react-native';
import {normalizeMessages,type PresentationAttachment} from './agentPresentation';
import {ImagePreview} from '../ui/ImagePreview';
import {creativeUI as s} from '../creative/creativeUI';
function EvidenceImage({attachment}:{attachment:PresentationAttachment}){
 const [failed,setFailed]=useState(false),[preview,setPreview]=useState(false);
 const name=attachment.displayName??attachment.filename??'参考图片';
 return <View style={{gap:6}}><Text selectable style={s.body}>{name}{attachment.filename?' · '+attachment.filename:''}</Text><Text selectable style={s.muted}>附件身份：{attachment.attachmentId??attachment.uri}</Text>{failed?<Text accessibilityRole="alert" style={s.error}>图片不可用，文件可能已丢失或无法读取；附件记录仍保留。</Text>:<Pressable accessibilityRole="button" accessibilityLabel={'查看参考图片 '+name} onPress={()=>setPreview(true)}><Image accessibilityLabel={name} source={{uri:attachment.uri}} style={{width:160,height:160}} resizeMode="contain" onError={()=>{setFailed(true);setPreview(false);}}/></Pressable>}<ImagePreview uri={preview&&!failed?attachment.uri:null} title={name} onClose={()=>setPreview(false)}/></View>;
}
/** Reuse the conversation's text/content-array/attachment normalization, without run actions. */
export function ReadOnlyMessage({message}:{message:{id:string;role:string;content?:unknown;attachments?:unknown[]}}){
 const normalized=normalizeMessages([message])[0];
 return <View style={s.card}><Text selectable style={s.muted}>{({user:'你',assistant:'助手',tool:'工具记录',system:'系统说明'} as Record<string,string>)[message.role]??'消息'}</Text><Text selectable style={s.body}>{normalized?.text??(typeof message.content==='string'?message.content:JSON.stringify(message.content))}</Text>{normalized?.kind==='user'?normalized.attachments.map((attachment,index)=><EvidenceImage key={attachment.uri+':'+index} attachment={attachment}/>):null}</View>;
}
