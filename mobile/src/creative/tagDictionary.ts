import {normalizeTagQuery,tagMatchRank} from './tagMatching';
import {queryTagDictionary} from '../storage/tagDictionaryStore';
import {NativeModules} from 'react-native';
import {creativeAccounts} from './accountRuntime';
export type TagSuggestion={name:string;category?:number;count?:number;translation?:string;matchRank?:number;source:'local'|'official'};
let remoteInFlight=false;
const localCache=new Map<string,TagSuggestion[]>(),remoteCache=new Map<string,TagSuggestion[]>(),recent=new Map<string,number>();
export function rememberTag(name:string){recent.delete(name);recent.set(name,Date.now());if(recent.size>100)recent.delete(recent.keys().next().value!);}
export function rankSuggestions(items:TagSuggestion[],query:string){
 const normalized=normalizeTagQuery(query);
 const merged=new Map<string,TagSuggestion>();for(const item of items){const key=normalizeTagQuery(item.name),previous=merged.get(key);merged.set(key,{...previous,...item,matchRank:Math.min(previous?.matchRank??4,item.matchRank??tagMatchRank(item.name,normalized))});}
 return [...merged.values()].sort((a,b)=>{
  const rank=(t:TagSuggestion)=>Math.min(t.matchRank??4,tagMatchRank(t.name,normalized));
  const score=(t:TagSuggestion)=>(recent.has(t.name)?2:0)+(t.source==='official'?1:0)+Math.log10((t.count??0)+1);
  return rank(a)-rank(b)||score(b)-score(a)||a.name.localeCompare(b.name);
 }).slice(0,40);
}
export async function localTags(query:string):Promise<TagSuggestion[]>{
 const key=normalizeTagQuery(query);if(localCache.has(key))return localCache.get(key)!;
 const rows=await queryTagDictionary(key);
 const result=rows.map(row=>({...row,source:'local' as const}));localCache.set(key,result);if(localCache.size>64)localCache.delete(localCache.keys().next().value!);return result;
}
export async function officialTags(model:string,query:string):Promise<TagSuggestion[]>{
 const accounts=creativeAccounts(),account=(await accounts.list()).find(a=>a.provider_id==='novelai');if(!account)return [];
 const key=account.credential_generation_id+':'+model+':'+query;
 if(remoteCache.has(key))return remoteCache.get(key)!;
 if(remoteInFlight)return [];remoteInFlight=true;
 try {
 const credential=await accounts.resolveExact(account.credential_generation_id);
 const raw=await NativeModules.AutoDLMedia?.suggestNovelAiTags?.(model,query,credential.token);if(!raw)return [];
 const body=JSON.parse(raw);if(!Array.isArray(body.tags))return [];
 const result:TagSuggestion[]=body.tags.filter((t:any)=>typeof t?.tag==='string'&&t.tag.length>0&&t.tag.length<=200).slice(0,12).map((t:any)=>({name:t.tag,source:'official'}));
 remoteCache.set(key,result);if(remoteCache.size>64)remoteCache.delete(remoteCache.keys().next().value!);return result;
 }finally{remoteInFlight=false;}
}
