import {useEffect,useRef,useState} from 'react';
import {ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {ListAction} from '../ui/ListPageUI';
import {getDatabase} from '../storage/databaseClient';
import {rebuildSearchPage,searchProject} from './projectSearch';
import {readCreativeText} from './textContent';
import {creativeService} from './runtime';
import {creativeUI as s} from './creativeUI';
export function ProjectSearchScreen(){
 const {projectId}=useLocalSearchParams<{projectId:string}>(),router=useRouter();const lock=useRef(false),stop=useRef(false);
 useEffect(()=>()=>{stop.current=true;},[]);
 const [query,setQuery]=useState(''),[result,setResult]=useState<Awaited<ReturnType<typeof searchProject>>>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const work=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'读取失败');}finally{lock.current=false;setBusy(false);}};
 const search=(after='')=>void work(async()=>setResult(await searchProject(getDatabase(),projectId,query,after)));
 const rebuild=()=>void work(async()=>{stop.current=false;let after:string|undefined='',count=0,missing=0;do{const page=await rebuildSearchPage(getDatabase(),projectId,async row=>{const [version]=await creativeService().versionsByIds([row.version_id!]);if(!version)throw Error('VERSION_MISSING');return readCreativeText(version);},after);count+=page.indexed;missing+=page.unavailable.length;after=page.next;setMessage(`已索引 ${count} 项，${missing} 项无法读取`);}while(after&&!stop.current);setMessage(`索引${stop.current?'已暂停':'已更新'}：${count} 项，${missing} 项无法读取。`);});
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={{padding:16,gap:12}}><ListAction label="返回项目" secondary onPress={()=>{stop.current=true;router.back();}}/><Text style={s.title}>项目全文检索</Text><Text style={s.body}>检索镜头描述、设定版本、素材标签与已校验文本正文。空格分隔的关键词必须同时匹配；变更后的旧索引会隐藏，请更新索引。索引不发送到外部模型。</Text><TextInput accessibilityLabel="全文关键词" value={query} editable={!busy} onChangeText={v=>{setQuery(v);setResult(undefined);}} style={s.input}/><ListAction label="搜索" disabled={busy||!query.trim()} onPress={()=>search()}/><ListAction label="更新全部本地索引" secondary disabled={busy} onPress={rebuild}/>{busy?<ListAction label="暂停索引更新" secondary onPress={()=>{stop.current=true;}}/>:null}{message?<Text style={s.body}>{message}</Text>:null}{result?<Text style={s.muted}>有效索引 {result.coverage?.indexed??0}/{result.coverage?.total??0} · 本页 {result.items.length} 项</Text>:null}{result?.items.map(item=><View key={item.key} style={s.card}><Text style={s.title}>{item.title}</Text><Text selectable style={s.body}>{item.excerpt}</Text><Text selectable style={s.muted}>{item.kind} · {item.versionId??item.objectId}</Text><ListAction label="查看来源" secondary onPress={()=>{if(item.kind==='asset')router.push({pathname:'/creative-asset/[id]',params:{id:item.objectId}});else if(item.kind==='shot')router.push({pathname:'/creative-project/[id]',params:{id:projectId,tab:'shots',shotId:item.objectId}});else router.push({pathname:'/project-settings-library',params:{projectId,entityId:item.objectId,versionId:item.versionId!}});}}/></View>)}{result?.next?<ListAction label="下一页结果" secondary disabled={busy} onPress={()=>search(result.next)}/>:null}</ScrollView></SafeAreaView>;
}
