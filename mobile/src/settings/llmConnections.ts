import * as SecureStore from 'expo-secure-store';
import {z} from 'zod';
import {createId} from '../ids';
import {settingsEvents} from './events';
import {assertSafeHttpsUrl} from '../security/urlPolicy';
const key='llm.connections.v1';
const connection=z.object({id:z.string(),revision:z.number().int(),title:z.string().trim().min(1).max(80),endpoint:z.string().max(2000),model:z.string().trim().min(1).max(200),apiKey:z.string().min(1).max(4000),images:z.boolean(),revoked:z.boolean()}).strict();
export type LlmConnection=z.infer<typeof connection>;
const store=z.object({version:z.literal(1),active:z.string().nullable(),items:z.array(connection).max(8)}).strict();
let queue=Promise.resolve();
export async function readLlmConnections(){const raw=await SecureStore.getItemAsync(key);return raw?store.parse(JSON.parse(raw)):{version:1 as const,active:null,items:[] as LlmConnection[]};}
export async function activeLlmConnection(){const data=await readLlmConnections();const item=data.items.find(p=>p.id===data.active);return item?.revoked?{...item,apiKey:''}:item;}
async function mutate(fn:(data:z.infer<typeof store>)=>void){
 const work=queue.then(async()=>{const data=await readLlmConnections();fn(data);await SecureStore.setItemAsync(key,JSON.stringify(store.parse(data)));settingsEvents.publish();});queue=work.catch(()=>undefined);return work;
}
export async function saveLlmConnection(input:Pick<LlmConnection,'title'|'endpoint'|'model'|'apiKey'|'images'>){
 const endpoint=assertSafeHttpsUrl(input.endpoint.trim()).replace(/\/$/,'');
 const value=connection.parse({...input,endpoint,id:createId(),revision:1,revoked:false});
 await mutate(data=>{if(data.items.length>=8)throw Error('最多保存 8 个模型连接');data.items.push(value);});return value.id;
}
export async function selectLlmConnection(id:string|null){await mutate(data=>{if(id&&!data.items.some(p=>p.id===id&&!p.revoked))throw Error('LLM_CONNECTION_UNAVAILABLE');data.active=id;});}
export async function revokeLlmConnection(id:string){await mutate(data=>{const item=data.items.find(p=>p.id===id);if(!item)throw Error('LLM_CONNECTION_UNAVAILABLE');item.revoked=true;item.revision++;});}
export async function assertLlmConnection(config:{connectionId?:string;connectionRevision?:number}){
 if(!config.connectionId)return;
 const item=(await readLlmConnections()).items.find(p=>p.id===config.connectionId);
 if(!item||item.revoked||item.revision!==config.connectionRevision)throw Error('LLM_CONNECTION_REVOKED');
}
