import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {getDatabase} from '../storage/databaseClient';
import {ParameterSheet} from '../creative/WorkbenchUI';
import {ListAction} from '../ui/ListPageUI';
import {creativeUI as s} from '../creative/creativeUI';
import {HistoryList} from './HistoryList';
import {ReadOnlyMessage} from './ReadOnlyMessage';
import {createLocalThreadStore,type LocalThreadSnapshot} from './threadStore';

/** Local evidence remains available without a model connection or runtime. */
export function LocalHistoryBrowser({projectId,onClose}:{projectId?:string;onClose:()=>void}){
 const db=useMemo(getDatabase,[]),store=useMemo(()=>createLocalThreadStore(db),[db]);
 const [rows,setRows]=useState<LocalThreadSnapshot[]>([]),[selected,setSelected]=useState<LocalThreadSnapshot>();
 const [reading,setReading]=useState(false),[error,setError]=useState('');
 const page=useRef({query:'',count:0,hasMore:true}),listGeneration=useRef(0),detailGeneration=useRef(0);
 useEffect(()=>()=>{listGeneration.current++;detailGeneration.current++;},[]);
 const search=useCallback(async(query:string,more=false)=>{
  if(more&&!page.current.hasMore)return;
  const request=++listGeneration.current;
  const next=await store.listSummaries({projectId,query,offset:more?page.current.count:0,limit:50});
  if(request!==listGeneration.current)return;
  page.current={query,count:(more?page.current.count:0)+next.length,hasMore:next.length===50};
  setRows(current=>more?[...current,...next.filter(row=>!current.some(old=>old.threadId===row.threadId))]:next);
 },[projectId,store]);
 const select=async(id:string)=>{
  const request=++detailGeneration.current;setReading(true);setError('');setSelected(undefined);
  try{
   if(projectId){const scope=await db.getFirstAsync<{project_id:string|null}>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?',id);if(scope?.project_id!==projectId)throw Error('对话已不属于当前项目，请重新搜索');}
   const value=await store.load(id);
   if(request!==detailGeneration.current)return;
   if(!value)throw Error('本地对话已删除或不可用');
   setSelected(value);
  }catch(reason){if(request===detailGeneration.current)setError(reason instanceof Error?reason.message:'读取失败，请重试');}
  finally{if(request===detailGeneration.current)setReading(false);}
 };
 const close=()=>{if(selected||reading){detailGeneration.current++;setSelected(undefined);setReading(false);setError('');}else onClose();};
 return <ParameterSheet fullScreen scrollable={false} title={selected?(selected.customTitle??selected.summary?.title??'本地对话 · 只读'):projectId?'本项目本地对话 · 只读':'本地对话 · 只读'} onClose={close}>
  <Text style={[s.muted,{padding:12}]}>仅查看已保存的文字和附件；不会连接模型、创建运行或发送消息。</Text>
  {reading?<Text accessibilityLiveRegion="polite" style={s.body}>正在读取本地对话…</Text>:null}
  {error?<Text accessibilityRole="alert" style={s.body}>{error}</Text>:null}
  <View style={{flex:1,display:selected||reading?'none':'flex'}}><HistoryList readOnly threads={rows} activeThreadId="" onSelect={id=>void select(id)} onNew={()=>{}} onDelete={()=>{}} onRename={()=>{}} onRenameVisibilityChange={()=>{}} onSearchHistory={query=>search(query)} onLoadMoreHistory={()=>search(page.current.query,true)}/></View>
  {selected?<ScrollView contentContainerStyle={{padding:12,gap:12}}><ListAction label="返回本地对话列表" secondary onPress={close}/>{!selected.messages.length?<Text style={s.muted}>此对话没有已保存的消息。</Text>:selected.messages.map(message=><ReadOnlyMessage key={message.id} message={message}/>)}</ScrollView>:null}
 </ParameterSheet>;
}
