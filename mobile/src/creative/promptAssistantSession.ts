import { readPromptRuns, endPromptRun } from '../agent/runState';
import * as FileSystem from 'expo-file-system/legacy';
import CryptoJS from 'crypto-js';
import { proposalSchema, type AssistMessage } from './promptAssistant';
const folder=()=>`${FileSystem.documentDirectory}prompt-assistant/`;
const path=(id:string)=>`${folder()}${CryptoJS.SHA256(id).toString()}.json`;
const queues=new Map<string,Promise<void>>();
export async function readPromptSession(id:string):Promise<AssistMessage[]> {
  await queues.get(id)?.catch(()=>undefined);
  const file=path(id);if(!(await FileSystem.getInfoAsync(file)).exists)return [];
  const data=JSON.parse(await FileSystem.readAsStringAsync(file));
  if(!Array.isArray(data))throw new Error('提示词讨论记录无法读取');
  return data.filter(m=>['user','assistant'].includes(m?.role)&&typeof m.content==='string'&&m.content.length<=30000).map((m,index)=>({id:typeof m.id==='string'?m.id:`legacy-${CryptoJS.SHA256(id).toString().slice(0,12)}-${index}`,role:m.role,content:m.content,...(readPromptRuns({h3Runs:[m.run]}).length?{run:endPromptRun(m.run,'interrupted',m.run.tools.reduce((last:number,t:{startedAt:number;endedAt?:number})=>Math.max(last,t.endedAt??t.startedAt),m.run.startedAt))}:{}),...(m.proposal?{proposal:proposalSchema.parse(m.proposal)}:{}),...(typeof m.base==='string'?{base:m.base}:{})}));
}
export function writePromptSession(id:string,messages:AssistMessage[]) {
  const payload=JSON.stringify(messages);
  const next=(queues.get(id)??Promise.resolve()).catch(()=>undefined).then(async()=>{
    await FileSystem.makeDirectoryAsync(folder(),{intermediates:true});
    await FileSystem.writeAsStringAsync(`${path(id)}.tmp`,payload);
    await FileSystem.moveAsync({from:`${path(id)}.tmp`,to:path(id)});
  });
  queues.set(id,next);void next.finally(()=>{if(queues.get(id)===next)queues.delete(id);}).catch(()=>undefined);return next;
}
