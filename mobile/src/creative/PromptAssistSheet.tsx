import { ConversationInput, ConversationSend } from '../conversation/ConversationInput';
import { ConversationList } from '../conversation/ConversationList';
import { ConversationMessage } from '../conversation/ConversationMessage';
import { AssistantTurn } from '../conversation/AssistantTurn';
import { RecordRow } from '../ui/RecordRow';
import { createId } from '../ids';
import { endPromptRun, type PromptRun } from '../agent/runState';
import type {ComponentProps,ReactNode} from 'react';
import {readDiscussions,writeDiscussions,newDiscussion,readDiscussionComposer,writeDiscussionComposer,deleteDiscussionFiles,describeDiscussion,type DiscussionIndex} from './promptDiscussions';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { IconAction, TextAction } from './WorkbenchUI';
import { COLORS } from '../ui/theme';
import { creativeUI as s } from './creativeUI';
import { promptContextKey, proposalPatch, streamPromptAssistant, type AssistMessage, type PromptContext, type PromptPatch, type PromptProposal } from './promptAssistant';
import { readPromptSession, writePromptSession } from './promptAssistantSession';
import type { NovelAiDraftInput } from './novelAiProtocol';

function SuggestionField({label,value,onChange,onApply,disabled}:{label:string;value:string;onChange:(value:string)=>void;onApply?:()=>void;disabled:boolean}){
  const [expanded,setExpanded]=useState(false),[editing,setEditing]=useState(false);
  return <View style={{gap:4}}><View style={s.row}><Text style={{flex:1,fontSize:12,fontWeight:'600',color:COLORS.text}}>{label}</Text>
    <TextAction label={editing?`完成编辑${label}`:`编辑${label}`} disabled={disabled} onPress={()=>setEditing(!editing)}/>
    {onApply?<TextAction label={`采用${label}`} disabled={disabled} onPress={onApply}/>:null}</View>
    {editing?<TextInput accessibilityLabel={`建议${label}`} value={value} editable={!disabled} onChangeText={onChange} multiline scrollEnabled maxLength={10000} style={[s.input,{minHeight:80,maxHeight:180,fontSize:13,lineHeight:20}]}/>
      :<Text selectable numberOfLines={expanded?undefined:4} style={{fontSize:13,lineHeight:20,color:COLORS.text}}>{value||'（留空）'}</Text>}
    {!editing&&(value.length>120||value.split('\n').length>4)?<TextAction label={expanded?`收起${label}`:`展开完整${label}`} onPress={()=>setExpanded(!expanded)}/>:null}
  </View>;
}

export function PromptDiscussion({prompt,kind,onApply,onApplyPatch,onClose,sessionId,image,workflow,workflowTitle,disabled=false,discussionHeader,discussionList,onMessages}:{prompt:string;kind:'image'|'video';onApply:(value:string)=>void;onApplyPatch?:(patch:PromptPatch)=>void;onClose:()=>void;sessionId:string;image?:NovelAiDraftInput;workflow?:string;workflowTitle?:string;disabled?:boolean;discussionHeader?:ReactNode;discussionList?:ReactNode;onMessages?:(messages:AssistMessage[])=>void}) {
  const router=useRouter(),controller=useRef<AbortController|null>(null),mounted=useRef(true),scroll=useRef<FlatList<AssistMessage>>(null),follow=useRef(true);
  const context:PromptContext={prompt,kind,image,workflow},contextKey=promptContextKey(context);
  const current=useRef(context);current.current=context;
  const composer=useRef({text:'',offset:0}),composerReady=useRef(false);
  useEffect(()=>{let active=true;void readDiscussionComposer(sessionId).then(value=>{if(active){composer.current=value;composerReady.current=true;setInstruction(value.text);follow.current=value.offset===0;setAway(value.offset>0);requestAnimationFrame(()=>scroll.current?.scrollToOffset({offset:value.offset,animated:false}));}}).catch(()=>undefined);return()=>{active=false;if(composerReady.current)void writeDiscussionComposer(sessionId,composer.current).catch(()=>undefined);};},[sessionId]);
  const [away,setAway]=useState(false),userScrolling=useRef(false);
  const inspectProcess=useCallback(()=>{follow.current=false;setAway(true);},[]);
  const [messages,setMessages]=useState<AssistMessage[]>([]),history=useRef<AssistMessage[]>([]);
  const [ready,setReady]=useState(false),[instruction,setInstruction]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[storageError,setStorageError]=useState('');
  useEffect(()=>{if(!composerReady.current)return;const timer=setTimeout(()=>{void writeDiscussionComposer(sessionId,composer.current).catch(()=>{if(mounted.current)setStorageError('输入草稿尚未保存，请关闭前重试。');});},400);return()=>clearTimeout(timer);},[instruction,sessionId]);
  const [proposalId,setProposalId]=useState<string>();
  const [proposal,setProposal]=useState<PromptProposal>(),[base,setBase]=useState(''),[before,setBefore]=useState<PromptContext>();
  const [undo,setUndo]=useState<{patch:PromptPatch;expected:string}>(),[notice,setNotice]=useState('');
  useEffect(()=>{
    mounted.current=true;let active=true;setReady(false);
    void readPromptSession(sessionId).then(rows=>{if(active){history.current=rows;setMessages(rows);onMessages?.(rows);setReady(true);}}).catch(()=>{if(active)setStorageError('讨论记录读取失败，请关闭后重试，避免覆盖原记录。');});
    return()=>{active=false;mounted.current=false;controller.current?.abort();};
  },[sessionId]);
  const persist=(rows:AssistMessage[])=>{if(mounted.current)onMessages?.(rows);history.current=rows.map(row=>row.id?row:{...row,id:createId()});if(mounted.current)setMessages(history.current);void writePromptSession(sessionId,history.current).catch(()=>{if(mounted.current)setStorageError('讨论尚未保存到设备，请重试保存。');});};
  const send=async(value=instruction)=>{
    if(controller.current || !value.trim() || !ready)return;
    const request=new AbortController();controller.current=request;setBusy(true);setError('');setNotice('');setProposal(undefined);follow.current=true;setAway(false);
    const snapshot=current.current,key=promptContextKey(snapshot);
    const userId=createId(),replyId=createId();
    const rows=[...history.current,{id:userId,role:'user' as const,content:value.trim()}];
    let run:PromptRun={id:createId(),userMessageId:userId,messageIds:[replyId],status:'running',startedAt:Date.now(),tools:[]};
    const checkpoint=(content:string)=>persist([...rows,{id:replyId,role:'assistant',content,run}]);
    checkpoint('');setInstruction('');composer.current.text='';
    let partial='',lastSaved=0;
    try{
      const result=await streamPromptAssistant(snapshot,rows,request.signal,text=>{partial=text;if(mounted.current&&controller.current===request&&!request.signal.aborted){setMessages([...rows,{id:replyId,role:'assistant',content:text,run}]);if(Date.now()-lastSaved>750){lastSaved=Date.now();checkpoint(text);}};},()=>undefined,tool=>{run={...run,tools:run.tools.some(t=>t.id===tool.id)?run.tools.map(t=>t.id===tool.id?tool:t):[...run.tools,tool]};checkpoint(partial);},activity=>{run={...run,activities:run.activities?.some(a=>a.id===activity.id)?run.activities.map(a=>a.id===activity.id?activity:a):[...(run.activities??[]),activity]};});
      if(request.signal.aborted){run=endPromptRun(run,'cancelled',Date.now());checkpoint(partial);return;}
      run=endPromptRun(run,'completed',Date.now());follow.current=false;setAway(true);
      const next=[...rows,{id:replyId,role:'assistant' as const,...result,base:key,run}];
      if(mounted.current&&controller.current===request){persist(next);setProposalId(replyId);setProposal(result.proposal);setBase(key);setBefore(snapshot);}
    }catch(e){run=endPromptRun(run,request.signal.aborted?'cancelled':'failed',Date.now(),request.signal.aborted?undefined:e instanceof Error?e.message:'获取建议失败');checkpoint(partial);if(mounted.current&&controller.current===request){if(request.signal.aborted)setNotice('已停止，可继续补充要求。');else{setInstruction(value);composer.current.text=value;}}}
    finally{const owns=controller.current===request;if(owns)controller.current=null;if(mounted.current&&owns){setBusy(false);if(request.signal.aborted){setNotice('已停止，可继续补充要求。');}}}
  };
  const applyPatch=(patch:PromptPatch)=>{if(onApplyPatch)onApplyPatch(patch);else if(patch.prompt!==undefined)onApply(patch.prompt);};
  const apply=(part:PromptProposal)=>{
    if(!before || contextKey!==base || disabled)return;
    try{
      const patch=proposalPatch(part,current.current);
      const previous:PromptPatch={};for(const key of Object.keys(patch) as Array<keyof PromptPatch>){if(key==='prompt')previous.prompt=prompt;else if(key==='negative')previous.negative=image?.negative;else previous.characters=image?.characters;}
      const next:PromptContext={...context,prompt:patch.prompt??prompt,image:image?{...image,...patch}:undefined};
      if(part.addCharacters?.length){setProposal(undefined);setProposalId(undefined);}
      setUndo({patch:previous,expected:promptContextKey(next)});applyPatch(patch);setBase(promptContextKey(next));setBefore(next);setNotice('已采用，可继续调整或撤销。');
      persist([...history.current,{role:'user',content:`已采用修改：${JSON.stringify(patch)}`}]);
    }catch(e){setError(e instanceof Error?e.message:'无法采用建议');}
  };
  const field=(label:string,value:string,change:(value:string)=>void,part:PromptProposal)=><SuggestionField key={label} label={label} value={value} onChange={change} disabled={disabled||busy||base!==contextKey} onApply={()=>apply(part)}/>;
  const proposalCard = proposal?<View style={{padding:10,gap:10,borderRadius:12,borderWidth:1,borderColor:COLORS.border}}><Text style={{fontSize:13,fontWeight:'600',color:COLORS.text}}>{proposal.summary}</Text>
        {proposal.prompt!==undefined?field('描述',proposal.prompt,prompt=>setProposal({...proposal,prompt}),{summary:proposal.summary,prompt:proposal.prompt}):null}
        {proposal.negative!==undefined?field('负面词',proposal.negative,negative=>setProposal({...proposal,negative}),{summary:proposal.summary,negative:proposal.negative}):null}
        {proposal.characters?.map((character,index)=><View key={character.index} style={{gap:6}}>{(['prompt','negative'] as const).map(key=>character[key]!==undefined?field(`角色 ${character.index+1}${key==='prompt'?'描述':'负面'}`,character[key]!,value=>setProposal({...proposal,characters:proposal.characters!.map((c,i)=>i===index?{...c,[key]:value}:c)}),{summary:proposal.summary,characters:[{index:character.index,[key]:character[key]}]}):null)}</View>)}
        {proposal.addCharacters?.map((character,index)=><View key={`new-${index}`} style={{gap:4}}>{(['prompt','negative'] as const).map(key=>character[key]!==undefined?<SuggestionField key={key} label={`新增角色 ${index+1}${key==='prompt'?'描述':'负面'}`} value={character[key]!} disabled={busy} onChange={value=>setProposal({...proposal,addCharacters:proposal.addCharacters!.map((c,i)=>i===index?{...c,[key]:value}:c)})}/>:null)}</View>)}
        <TextAction label="采用全部修改" disabled={disabled||busy||base!==contextKey} onPress={()=>apply(proposal)}/>
        {base!==contextKey?<Text style={s.muted}>草稿已变化，请基于当前内容重新讨论后采用。</Text>:null}
      </View>:null;
  return <View style={{flex:1,minHeight:0,backgroundColor:COLORS.surface}}>
    <View style={{paddingHorizontal:10,paddingBottom:6,borderBottomWidth:0.5,borderBottomColor:COLORS.border}}>
      <View style={{flexDirection:'row',alignItems:'center'}}><View style={{flex:1,minWidth:0}}>{discussionHeader??<Text style={{fontSize:14,fontWeight:'700',color:COLORS.text}}>提示词协作</Text>}</View><IconAction label="助手模型设置" icon="settings" onPress={()=>{onClose();router.push({pathname:'/(tabs)/settings',params:{section:'assistant'}});}}/><IconAction label="关闭提示词协作" icon="close" onPress={onClose}/></View>
      <Text numberOfLines={1} style={{fontSize:10,color:COLORS.textMuted}}>{image?`${image.model.replace('nai-diffusion-','')} · ${image.effort}`:workflowTitle||'视频镜头'} · 当前草稿{image?.sourceVersionId?' · 参考图未参与分析':''}</Text>
    </View>
    {discussionList??<ConversationList listRef={scroll} data={messages} keyExtractor={item=>item.id!} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" onScroll={event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;composer.current.offset=contentOffset.y;if(userScrolling.current){follow.current=contentSize.height-contentOffset.y-layoutMeasurement.height<60;setAway(!follow.current);}}} onScrollBeginDrag={()=>{userScrolling.current=true;}} onScrollEndDrag={()=>{userScrolling.current=false;}} onMomentumScrollBegin={()=>{userScrolling.current=true;}} onMomentumScrollEnd={()=>{userScrolling.current=false;}} scrollEventThrottle={100} onContentSizeChange={()=>{if(follow.current)scroll.current?.scrollToEnd({animated:false});}} contentContainerStyle={{padding:12,gap:12}}
      ListHeaderComponent={!messages.length?<><Text style={s.muted}>描述你想创作的内容，也可以继续修改当前草稿。建议由你确认后填入，不会直接生成。</Text><View style={s.row}>{['润色，保留原意','补充光线与构图','精简重复描述',...(kind==='image'?['从构思创建场景与角色提示词','将不同人物拆分为角色提示词']:[])].map(value=><TextAction key={value} label={value} disabled={!ready||busy} onPress={()=>void send(value)}/>)}</View></>:null}
      renderItem={({item:message})=>{
        // Keep the full patch in model history without rendering JSON as a user bubble.
        if(message.role==='user'&&message.content.startsWith('已采用修改：'))return <Text style={s.muted}>已采用建议到当前草稿</Text>;
        if(message.role==='user'&&message.content.startsWith('已撤销上次采用'))return <Text style={s.muted}>已撤销上次采用</Text>;
        const result=<>
          {message.proposal && proposalId!==message.id?<TextAction label="查看修改建议" disabled={busy} onPress={()=>{setProposalId(message.id);setProposal(message.proposal);setBase(message.base??'');setBefore(current.current);follow.current=false;}}/>:null}
          {proposalId===message.id?proposalCard:null}
        </>;
        return message.run ? <AssistantTurn run={message.run} text={message.content} onInspect={inspectProcess}>{result}</AssistantTurn>
          : <ConversationMessage role={message.role} text={message.content}>{result}</ConversationMessage>;
      }}
      ListFooterComponent={<View style={{gap:8}}>
      {notice?<Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text>:null}
      {undo?<TextAction label="撤销上次采用" disabled={disabled||busy||undo.expected!==contextKey} onPress={()=>{applyPatch(undo.patch);setUndo(undefined);setNotice('已撤销上次采用。');persist([...history.current,{role:'user',content:'已撤销上次采用，请以当前草稿为准。'}]);}}/>:null}
      {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
      {storageError?<><Text accessibilityRole="alert" style={s.error}>{storageError}</Text>{ready?<TextAction label="重试保存讨论" onPress={()=>void writePromptSession(sessionId,history.current).then(()=>setStorageError('')).catch(()=>setStorageError('保存失败，请重试。'))}/>:null}</>:null}
</View>}
    />}
    {!discussionList && away?<TextAction label={busy?'查看最新进展 ↓':'回到最新消息 ↓'} onPress={()=>{userScrolling.current=false;follow.current=true;setAway(false);scroll.current?.scrollToEnd({animated:true});}}/>:null}
    {!discussionList?<View style={{padding:8,gap:6,flexDirection:'row',alignItems:'flex-end',borderTopWidth:0.5,borderTopColor:COLORS.border}}><ConversationInput accessibilityLabel="提示词修改方向" placeholder="继续描述修改方向…" value={instruction} onChangeText={text=>{composer.current.text=text;setInstruction(text);}} maxLength={4000}/><ConversationSend running={busy} disabled={!ready||!instruction.trim()} onSend={()=>void send()} onStop={()=>controller.current?.abort()}/></View>:null}
  </View>;
}

export function PromptAssistSheet(props:ComponentProps<typeof PromptDiscussion> & {workspaceId?:string}){
  const scope=props.workspaceId??props.sessionId;
  return <DiscussionWorkspace key={scope} {...props} scope={scope}/>;
}
function DiscussionWorkspace(props:ComponentProps<typeof PromptDiscussion> & {scope:string}){
  const [index,setIndex]=useState<DiscussionIndex>(),[list,setList]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false),[search,setSearch]=useState(''),[renaming,setRenaming]=useState<string>(),[rename,setRename]=useState('');
  const latest=useRef<DiscussionIndex|undefined>(undefined),lock=useRef(false);
  useEffect(()=>{let active=true;void readDiscussions(props.scope,props.sessionId).then(async value=>{
    const items=await Promise.all(value.items.map(async item=>{try{return describeDiscussion(item,await readPromptSession(item.id));}catch{return item;}}));
    if(active){latest.current={...value,items};setIndex(latest.current);}
  }).catch(()=>{if(active)setError('讨论列表读取失败，请关闭后重试。');});return()=>{active=false;};},[props.scope]);
  const choose=async(next:DiscussionIndex)=>{if(lock.current)return false;lock.current=true;setSaving(true);try{await writeDiscussions(props.scope,next);latest.current=next;setIndex(next);setList(false);setRenaming(undefined);setError('');return true;}catch{setError('讨论切换未保存，请重试。');return false;}finally{lock.current=false;setSaving(false);}};
  const summarize=useCallback((messages:AssistMessage[])=>{
    const value=latest.current;if(!value||lock.current)return;
    const items=value.items.map(item=>item.id===value.active?describeDiscussion(item,messages):item);
    const next={...value,items};if(JSON.stringify(next)===JSON.stringify(value))return;
    latest.current=next;setIndex(next);void writeDiscussions(props.scope,next).catch(()=>setError('讨论摘要未保存，请稍后重试。'));
  },[props.scope]);
  return <View style={{flex:1,minHeight:0,backgroundColor:COLORS.surface}}>
    {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
    {index?<PromptDiscussion key={index.active} {...props} sessionId={index.active} onMessages={summarize}
      discussionHeader={<View style={{flexDirection:'row',alignItems:'center',gap:2}}>
        <Text numberOfLines={1} style={{flex:1,fontSize:14,fontWeight:'700',color:COLORS.text}}>{list?'讨论历史':'提示词协作'}</Text>
        <IconAction label={list?'返回当前讨论':'讨论历史'} icon={list?'arrow_back':'list_alt'} disabled={saving} onPress={()=>{Keyboard.dismiss();setList(!list);}}/>
        <IconAction label="新建讨论" icon="add" disabled={saving} onPress={()=>{Keyboard.dismiss();void choose(newDiscussion(latest.current!));}}/>
      </View>}
      discussionList={list?<ScrollView style={{flex:1}} keyboardShouldPersistTaps="handled">
        <TextInput accessibilityLabel="搜索讨论" placeholder="搜索主题和答复" value={search} onChangeText={setSearch} style={[s.input,{margin:12}]}/>
        {index.items.filter(item=>`${item.title} ${item.preview??''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(item=><View key={item.id} style={{paddingHorizontal:12}}>
          <RecordRow title={item.title} detail={item.preview??'尚未发送消息'} meta={`${item.turns??0} 轮讨论 · ${new Date(item.createdAt).toLocaleDateString('zh-CN')}`} selected={item.id===index.active} disabled={saving} onPress={()=>void choose({...latest.current!,active:item.id})}
            trailing={<IconAction icon="more_horiz" label={`管理讨论：${item.title}`} disabled={saving} onPress={()=>Alert.alert('管理讨论',item.title,[{text:'取消',style:'cancel'},{text:'重命名',onPress:()=>{setRename(item.title);setRenaming(item.id);}},{text:'删除',style:'destructive',onPress:()=>{const value=latest.current!,items=value.items.filter(i=>i.id!==item.id);void choose(items.length?{items,active:value.active===item.id?items[0].id:value.active}:newDiscussion({items:[],active:''})).then(success=>success?deleteDiscussionFiles(item.id):undefined).catch(()=>setError('删除记录未完成，请重试'));}}])}/>}/>
          {renaming===item.id?<View style={{gap:4}}><TextInput accessibilityLabel="讨论名称" value={rename} onChangeText={setRename} maxLength={60} style={s.input}/><View style={s.row}><TextAction label="保存名称" disabled={!rename.trim()||saving} onPress={()=>void choose({...latest.current!,items:latest.current!.items.map(i=>i.id===item.id?{...i,title:rename.trim(),customTitle:true}:i)}).then(success=>{if(success)setRenaming(undefined);})}/><TextAction label="取消重命名" onPress={()=>setRenaming(undefined)}/></View></View>:null}
        </View>)}
      </ScrollView>:null}/>:<View style={{padding:12}}><Text style={s.muted}>{error?'讨论暂不可用':'正在读取讨论…'}</Text><TextAction label="关闭提示词协作" onPress={props.onClose}/></View>}
  </View>;
}
