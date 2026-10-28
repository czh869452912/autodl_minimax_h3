import * as FileSystem from 'expo-file-system/legacy';
import CryptoJS from 'crypto-js';
import {createId} from '../ids';
export type Discussion={id:string;title:string;createdAt:number;preview?:string;turns?:number;updatedAt?:number;customTitle?:boolean};
export type DiscussionIndex={active:string;items:Discussion[]};
const queues=new Map<string,Promise<void>>();
const path=(scope:string)=>`${FileSystem.documentDirectory}prompt-assistant/index-${CryptoJS.SHA256(scope)}.json`;
export async function readDiscussions(scope:string,legacy:string):Promise<DiscussionIndex>{
  await queues.get(scope)?.catch(()=>undefined);
  if((await FileSystem.getInfoAsync(path(scope))).exists){
    const index=JSON.parse(await FileSystem.readAsStringAsync(path(scope))) as DiscussionIndex;
    if(!Array.isArray(index.items)||!index.items.length||!index.items.every(i=>typeof i.id==='string'&&typeof i.title==='string')||!index.items.some(i=>i.id===index.active))throw new Error('讨论索引无法读取');
    return index;
  }
  // Keep the original message file as the first discussion; migration never destroys it.
  const ownerFile=path(`legacy-owner:${legacy}`);
  const owner=(await FileSystem.getInfoAsync(ownerFile)).exists?await FileSystem.readAsStringAsync(ownerFile):undefined;
  // The first image submission assigns an asset ID to the same editable workspace.
  // Carry its discussion index forward rather than dropping pre-generation discussions.
  if(owner&&owner!==scope&&owner===legacy&&scope.startsWith('image:')&&legacy.startsWith('image:')){
    await queues.get(owner)?.catch(()=>undefined);
    if((await FileSystem.getInfoAsync(path(owner))).exists){
      const previous=JSON.parse(await FileSystem.readAsStringAsync(path(owner))) as DiscussionIndex;
      if(Array.isArray(previous.items)&&previous.items.some(item=>item.id===previous.active)){
        await writeDiscussions(scope,previous);return previous;
      }
    }
  }
  const firstId=owner&&owner!==scope?`discussion:${createId()}`:legacy;
  if(!owner){await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}prompt-assistant/`,{intermediates:true});await FileSystem.writeAsStringAsync(ownerFile,scope);}
  const index={active:firstId,items:[{id:firstId,title:firstId===legacy?'已有讨论':'新讨论',createdAt:Date.now()}]};
  await writeDiscussions(scope,index);return index;
}
export function writeDiscussions(scope:string,index:DiscussionIndex){
  const payload=JSON.stringify(index),next=(queues.get(scope)??Promise.resolve()).catch(()=>undefined).then(async()=>{
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}prompt-assistant/`,{intermediates:true});
    await FileSystem.writeAsStringAsync(`${path(scope)}.tmp`,payload);
    await FileSystem.moveAsync({from:`${path(scope)}.tmp`,to:path(scope)});
  });queues.set(scope,next);return next;
}
export function newDiscussion(index:DiscussionIndex):DiscussionIndex{
  const item={id:`discussion:${createId()}`,title:`新讨论 ${index.items.length+1}`,createdAt:Date.now()};
  return {active:item.id,items:[item,...index.items]};
}
export type DiscussionComposer={text:string;offset:number};
export async function readDiscussionComposer(id:string):Promise<DiscussionComposer>{
  const file=path(`composer:${id}`);await queues.get(`composer:${id}`)?.catch(()=>undefined);
  if(!(await FileSystem.getInfoAsync(file)).exists)return {text:'',offset:0};
  const data=JSON.parse(await FileSystem.readAsStringAsync(file));
  return {text:typeof data.text==='string'?data.text:'',offset:Number.isFinite(data.offset)?data.offset:0};
}
export function writeDiscussionComposer(id:string,value:DiscussionComposer){
  const key=`composer:${id}`,payload=JSON.stringify(value);
  const next=(queues.get(key)??Promise.resolve()).catch(()=>undefined).then(async()=>{
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}prompt-assistant/`,{intermediates:true});
    await FileSystem.writeAsStringAsync(`${path(key)}.tmp`,payload);
    await FileSystem.moveAsync({from:`${path(key)}.tmp`,to:path(key)});
  });queues.set(key,next);return next;
}
export async function deleteDiscussionFiles(id:string){
  await queues.get(`composer:${id}`)?.catch(()=>undefined);
  await FileSystem.deleteAsync(path(`composer:${id}`),{idempotent:true});
  const {writePromptSession}=await import('./promptAssistantSession');
  await writePromptSession(id,[]);
}

export function describeDiscussion(item:Discussion,messages:import('./promptAssistant').AssistMessage[]):Discussion {
  const requests=messages.filter(m=>m.role==='user'&&!m.content.startsWith('已采用修改：')&&!m.content.startsWith('已撤销上次采用'));
  const last=messages.filter(m=>m.role==='assistant').at(-1);
  const compact=(text:string)=>text.replace(/\s+/g,' ').trim();
  const customTitle=item.customTitle??(!item.preview&&!/^(已有讨论|新讨论)( \d+)?$/.test(item.title));
  const request=requests[0]?.content;
  const generic=request&&['润色，保留原意','补充光线与构图','精简重复描述','整理为适合当前模型的标签'].includes(request);
  const topic=generic?messages.find(m=>m.proposal)?.proposal?.summary:undefined;
  return {...item,customTitle,title:customTitle?item.title:compact(topic||request||item.title).slice(0,60),
    preview:compact(last?.proposal?.summary||last?.content||requests.at(-1)?.content||'尚未发送消息').slice(0,140),turns:requests.length};
}
