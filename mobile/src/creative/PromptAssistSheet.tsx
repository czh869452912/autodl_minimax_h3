import type {ComponentProps,ReactNode} from 'react';
import {readDiscussions,writeDiscussions,newDiscussion,readDiscussionComposer,writeDiscussionComposer,deleteDiscussionFiles,type DiscussionIndex} from './promptDiscussions';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { IconAction, TextAction } from './WorkbenchUI';
import { COLORS } from '../ui/theme';
import { creativeUI as s } from './creativeUI';
import { promptContextKey, proposalPatch, streamPromptAssistant, type AssistMessage, type PromptContext, type PromptPatch, type PromptProposal } from './promptAssistant';
import { readPromptSession, writePromptSession } from './promptAssistantSession';
import type { NovelAiDraftInput } from './novelAiProtocol';

export function PromptDiscussion({prompt,kind,onApply,onApplyPatch,onClose,sessionId,image,workflow,disabled=false,discussionHeader,discussionList}:{prompt:string;kind:'image'|'video';onApply:(value:string)=>void;onApplyPatch?:(patch:PromptPatch)=>void;onClose:()=>void;sessionId:string;image?:NovelAiDraftInput;workflow?:string;disabled?:boolean;discussionHeader?:ReactNode;discussionList?:ReactNode}) {
  const router=useRouter(),controller=useRef<AbortController|null>(null),mounted=useRef(true),scroll=useRef<ScrollView>(null),follow=useRef(true);
  const context:PromptContext={prompt,kind,image,workflow},contextKey=promptContextKey(context);
  const current=useRef(context);current.current=context;
  const composer=useRef({text:'',offset:0}),composerReady=useRef(false);
  useEffect(()=>{let active=true;void readDiscussionComposer(sessionId).then(value=>{if(active){composer.current=value;composerReady.current=true;setInstruction(value.text);follow.current=value.offset===0;requestAnimationFrame(()=>scroll.current?.scrollTo({y:value.offset,animated:false}));}}).catch(()=>undefined);return()=>{active=false;if(composerReady.current)void writeDiscussionComposer(sessionId,composer.current).catch(()=>undefined);};},[sessionId]);
  const [messages,setMessages]=useState<AssistMessage[]>([]),history=useRef<AssistMessage[]>([]);
  const [ready,setReady]=useState(false),[instruction,setInstruction]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[storageError,setStorageError]=useState(''),[live,setLive]=useState(''),[status,setStatus]=useState('');
  useEffect(()=>{if(!composerReady.current)return;const timer=setTimeout(()=>{void writeDiscussionComposer(sessionId,composer.current).catch(()=>{if(mounted.current)setStorageError('输入草稿尚未保存，请关闭前重试。');});},400);return()=>clearTimeout(timer);},[instruction,sessionId]);
  const [proposal,setProposal]=useState<PromptProposal>(),[base,setBase]=useState(''),[before,setBefore]=useState<PromptContext>();
  const [undo,setUndo]=useState<{patch:PromptPatch;expected:string}>(),[notice,setNotice]=useState('');
  useEffect(()=>{
    mounted.current=true;let active=true;setReady(false);
    void readPromptSession(sessionId).then(rows=>{if(active){history.current=rows;setMessages(rows);setReady(true);}}).catch(()=>{if(active)setStorageError('讨论记录读取失败，请关闭后重试，避免覆盖原记录。');});
    return()=>{active=false;mounted.current=false;controller.current?.abort();};
  },[sessionId]);
  const persist=(rows:AssistMessage[])=>{history.current=rows.slice(-24);setMessages(history.current);void writePromptSession(sessionId,history.current).catch(()=>{if(mounted.current)setStorageError('讨论尚未保存到设备，请重试保存。');});};
  const send=async(value=instruction)=>{
    if(controller.current || !value.trim() || !ready)return;
    const request=new AbortController();controller.current=request;setBusy(true);setError('');setNotice('');setLive('');setProposal(undefined);follow.current=true;
    const snapshot=current.current,key=promptContextKey(snapshot);
    const rows=[...history.current,{role:'user' as const,content:value.trim()}];persist(rows);setInstruction('');composer.current.text='';
    let partial='';
    try{
      const result=await streamPromptAssistant(snapshot,rows,request.signal,text=>{partial=text;if(mounted.current&&controller.current===request&&!request.signal.aborted)setLive(text);},text=>{if(mounted.current&&controller.current===request&&!request.signal.aborted)setStatus(text);});
      if(request.signal.aborted)return;
      const next=[...rows,{role:'assistant' as const,...result,base:key}];
      if(mounted.current&&controller.current===request){persist(next);setProposal(result.proposal);setBase(key);setBefore(snapshot);setLive('');}
    }catch(e){if(mounted.current&&controller.current===request){if(request.signal.aborted){if(partial)persist([...rows,{role:'assistant',content:`${partial}\n（本轮已停止）`}]);setNotice('已停止，可继续补充要求。');}else{setError(e instanceof Error?e.message:'获取建议失败，请重试');setInstruction(value);}setLive('');}}
    finally{const owns=controller.current===request;if(owns)controller.current=null;if(mounted.current&&owns){setBusy(false);setStatus('');if(request.signal.aborted){setLive('');setNotice('已停止，可继续补充要求。');}}}
  };
  const applyPatch=(patch:PromptPatch)=>{if(onApplyPatch)onApplyPatch(patch);else if(patch.prompt!==undefined)onApply(patch.prompt);};
  const apply=(part:PromptProposal)=>{
    if(!before || contextKey!==base || disabled)return;
    try{
      const patch=proposalPatch(part,current.current);
      const previous:PromptPatch={};for(const key of Object.keys(patch) as Array<keyof PromptPatch>){if(key==='prompt')previous.prompt=prompt;else if(key==='negative')previous.negative=image?.negative;else previous.characters=image?.characters;}
      const next:PromptContext={...context,prompt:patch.prompt??prompt,image:image?{...image,...patch}:undefined};
      setUndo({patch:previous,expected:promptContextKey(next)});applyPatch(patch);setBase(promptContextKey(next));setBefore(next);setNotice('已采用，可继续调整或撤销。');
      persist([...history.current,{role:'user',content:`已采用修改：${JSON.stringify(patch)}`}]);
    }catch(e){setError(e instanceof Error?e.message:'无法采用建议');}
  };
  const field=(label:string,value:string,change:(value:string)=>void,part:PromptProposal)=><View key={label} style={{gap:6}}><View style={s.row}><Text style={{fontSize:12,fontWeight:'600',color:COLORS.text}}>{label}</Text><TextAction label={`采用${label}`} disabled={disabled || busy || base!==contextKey} onPress={()=>apply(part)}/></View><TextInput accessibilityLabel={`建议${label}`} value={value} multiline maxLength={10000} editable={!busy} onChangeText={change} style={[s.input,{minHeight:80,fontSize:13,lineHeight:19,borderColor:COLORS.border,backgroundColor:COLORS.background}]}/></View>;
  return <View style={{flex:1,minHeight:0,backgroundColor:COLORS.surface}}>
    <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:10,borderBottomWidth:0.5,borderBottomColor:COLORS.border}}><View style={{flex:1,paddingVertical:8}}>{discussionHeader??<Text style={{fontSize:14,fontWeight:'700',color:COLORS.text}}>提示词协作</Text>}<Text style={{fontSize:10,color:COLORS.textMuted}}>{image?`${image.model.replace('nai-diffusion-','')} · ${image.effort}`:workflow||'视频镜头'} · 当前草稿{image?.sourceVersionId?' · 参考图未参与分析':''}</Text></View><IconAction label="助手模型设置" icon="settings" onPress={()=>{onClose();router.push({pathname:'/(tabs)/settings',params:{section:'assistant'}});}}/><IconAction label="关闭提示词协作" icon="close" onPress={onClose}/></View>
    {discussionList??<ScrollView ref={scroll} keyboardShouldPersistTaps="handled" onScroll={event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;composer.current.offset=contentOffset.y;follow.current=contentSize.height-contentOffset.y-layoutMeasurement.height<60;}} scrollEventThrottle={100} onContentSizeChange={()=>{if(follow.current)scroll.current?.scrollToEnd({animated:false});}} contentContainerStyle={{padding:12,gap:12}}>
      {!messages.length?<><Text style={s.muted}>使用当前草稿，不包含其他讨论。说说想怎么改；建议不会直接生成媒体。</Text><View style={s.row}>{['润色，保留原意','补充光线与构图','精简重复描述',...(kind==='image'?['整理为适合当前模型的标签']:[])].map(value=><TextAction key={value} label={value} disabled={!ready||busy} onPress={()=>void send(value)}/>)}</View></>:null}
      {messages.map((message,index)=><View key={index} style={{padding:10,borderRadius:10,backgroundColor:message.role==='user'?COLORS.primarySoft:COLORS.background,gap:6}}><Text selectable style={{fontSize:13,lineHeight:20,color:COLORS.text}}>{message.content}</Text>{message.proposal?<TextAction label="查看这条建议" disabled={busy} onPress={()=>{setProposal(message.proposal);setBase(message.base??'');setBefore(current.current);follow.current=false;}}/>:null}</View>)}
      {busy?<View style={{gap:6}}><View style={{flexDirection:'row',gap:8,alignItems:'center'}}><ActivityIndicator size="small" color={COLORS.primary}/><Text accessibilityLiveRegion="polite" style={s.muted}>{status||'准备上下文…'}</Text></View>{live?<Text selectable style={s.body}>{live}</Text>:null}</View>:null}
      {proposal?<View style={{padding:10,gap:10,borderRadius:12,borderWidth:1,borderColor:COLORS.border}}><Text style={{fontSize:13,fontWeight:'600',color:COLORS.text}}>{proposal.summary}</Text>
        {proposal.prompt!==undefined?field('描述',proposal.prompt,prompt=>setProposal({...proposal,prompt}),{summary:proposal.summary,prompt:proposal.prompt}):null}
        {proposal.negative!==undefined?field('负面词',proposal.negative,negative=>setProposal({...proposal,negative}),{summary:proposal.summary,negative:proposal.negative}):null}
        {proposal.characters?.map((character,index)=><View key={character.index} style={{gap:6}}>{(['prompt','negative'] as const).map(key=>character[key]!==undefined?field(`角色 ${character.index+1}${key==='prompt'?'描述':'负面'}`,character[key]!,value=>setProposal({...proposal,characters:proposal.characters!.map((c,i)=>i===index?{...c,[key]:value}:c)}),{summary:proposal.summary,characters:[{index:character.index,[key]:character[key]}]}):null)}</View>)}
        <TextAction label="采用全部修改" disabled={disabled||busy||base!==contextKey} onPress={()=>apply(proposal)}/>
        {base!==contextKey?<Text style={s.muted}>草稿已变化，请基于当前内容重新讨论后采用。</Text>:null}
      </View>:null}
      {notice?<Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text>:null}
      {undo?<TextAction label="撤销上次采用" disabled={disabled||busy||undo.expected!==contextKey} onPress={()=>{applyPatch(undo.patch);setUndo(undefined);setNotice('已撤销上次采用。');persist([...history.current,{role:'user',content:'已撤销上次采用，请以当前草稿为准。'}]);}}/>:null}
      {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
      {storageError?<><Text accessibilityRole="alert" style={s.error}>{storageError}</Text>{ready?<TextAction label="重试保存讨论" onPress={()=>void writePromptSession(sessionId,history.current).then(()=>setStorageError('')).catch(()=>setStorageError('保存失败，请重试。'))}/>:null}</>:null}
    </ScrollView>}
    {!discussionList?<View style={{padding:8,gap:6,flexDirection:'row',alignItems:'flex-end',borderTopWidth:0.5,borderTopColor:COLORS.border}}><TextInput accessibilityLabel="提示词修改方向" placeholder="继续描述修改方向…" value={instruction} onChangeText={text=>{composer.current.text=text;setInstruction(text);}}  maxLength={4000} multiline style={[s.input,{flex:1,minHeight:40,maxHeight:88,borderColor:COLORS.border,fontSize:13}]}/><View style={{flexDirection:'row',justifyContent:'flex-end'}}>{busy?<TextAction label="停止" onPress={()=>controller.current?.abort()}/>:<TextAction label={error?'重试':'发送'} disabled={!ready||!instruction.trim()} onPress={()=>void send()}/>}</View></View>:null}
  </View>;
}

export function PromptAssistSheet(props:ComponentProps<typeof PromptDiscussion> & {workspaceId?:string}){
  const scope=props.workspaceId??props.sessionId;
  return <DiscussionWorkspace key={scope} {...props} scope={scope}/>;
}
function DiscussionWorkspace(props:ComponentProps<typeof PromptDiscussion> & {scope:string}){
  const [index,setIndex]=useState<DiscussionIndex>(),[list,setList]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false),[rename,setRename]=useState('');
  const lock=useRef(false);
  useEffect(()=>{let active=true;readDiscussions(props.scope,props.sessionId).then(value=>{if(active)setIndex(value);}).catch(()=>{if(active)setError('讨论列表读取失败，请关闭后重试。');});return()=>{active=false;};},[props.scope]);
  const choose=async(next:DiscussionIndex)=>{if(lock.current)return false;lock.current=true;setSaving(true);try{await writeDiscussions(props.scope,next);setIndex(next);setList(false);setError('');return true;}catch{setError('讨论切换未保存，请重试。');return false;}finally{lock.current=false;setSaving(false);}};
  return <View style={{flex:1,minHeight:0,backgroundColor:COLORS.surface}}>
    {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}

    {index?<PromptDiscussion key={index.active} {...props} sessionId={index.active} discussionList={list&&index?<ScrollView style={{flex:1}}>{index.items.map(item=><View key={item.id} style={{paddingHorizontal:12,flexDirection:'row',alignItems:'center'}}><View style={{flex:1}}><TextAction label={item.title+(item.id===index.active?' · 当前':'')} disabled={saving} onPress={()=>void choose({...index,active:item.id})}/></View><TextAction label={`删除讨论：${item.title}`} disabled={saving} onPress={()=>Alert.alert('删除讨论','删除后不再列出这条讨论，不影响草稿和生成结果。',[{text:'取消',style:'cancel'},{text:'删除',style:'destructive',onPress:()=>{const items=index.items.filter(i=>i.id!==item.id);void choose(items.length?{items,active:index.active===item.id?items[0].id:index.active}:newDiscussion({items:[],active:''})).then(success=>success?deleteDiscussionFiles(item.id):undefined).catch(()=>setError('删除未完成，请重试')); }}])}/></View>)}<View style={{padding:12,flexDirection:'row',gap:8}}><TextInput accessibilityLabel="讨论名称" placeholder="为当前讨论命名" value={rename} onChangeText={setRename} maxLength={60} style={[s.input,{flex:1}]}/><TextAction label="重命名" disabled={!rename.trim()||saving} onPress={()=>void choose({...index,items:index.items.map(i=>i.id===index.active?{...i,title:rename.trim()}:i)})}/></View></ScrollView>:null} discussionHeader={<View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:8}}>
      <View style={{flex:1}}><TextAction label={index?index.items.find(i=>i.id===index.active)!.title+' ▾':'读取讨论…'} disabled={!index||saving} onPress={()=>{Keyboard.dismiss();setList(!list);}} /></View>
      <TextAction label="新建讨论" disabled={!index||saving} onPress={()=>{if(index)void choose(newDiscussion(index));}}/>
    </View>}/>:<View style={{padding:12}}><Text style={s.muted}>{error?'讨论暂不可用':'正在读取讨论…'}</Text><TextAction label="关闭提示词协作" onPress={props.onClose}/></View>}
  </View>;
}
