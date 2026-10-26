import {Asset} from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import {openDatabaseAsync,type SQLiteDatabase} from 'expo-sqlite';
import {NativeModules} from 'react-native';
import {creativeAccounts} from './accountRuntime';
export type TagSuggestion={name:string;category?:number;count?:number;translation?:string;source:'local'|'official'};
let database:Promise<SQLiteDatabase>|undefined;
function dictionary(){
 if(!database)database=(async()=>{
  const asset=await Asset.fromModule(require('../../assets/tags/danbooru-v1.db')).downloadAsync();
  if(!asset.localUri)throw new Error('TAG_DICTIONARY_UNAVAILABLE');
  const directory=FileSystem.documentDirectory+'tag-dictionaries/';await FileSystem.makeDirectoryAsync(directory,{intermediates:true});
  const path=directory+'danbooru-v1.db';if(!(await FileSystem.getInfoAsync(path)).exists)await FileSystem.copyAsync({from:asset.localUri,to:path});
  const db=await openDatabaseAsync('danbooru-v1.db',{useNewConnection:true},directory);await db.execAsync('PRAGMA query_only=ON');return db;
 })().catch(error=>{database=undefined;throw error;});
 return database;
}
let remoteInFlight=false;
const localCache=new Map<string,TagSuggestion[]>(),remoteCache=new Map<string,TagSuggestion[]>(),recent=new Map<string,number>();
export function rememberTag(name:string){recent.delete(name);recent.set(name,Date.now());if(recent.size>100)recent.delete(recent.keys().next().value!);}
export function rankSuggestions(items:TagSuggestion[],query:string){
 const normalized=query.toLowerCase().replaceAll('_',' ');
 const merged=new Map<string,TagSuggestion>();for(const item of items){const key=item.name.replaceAll('_',' ');merged.set(key,{...merged.get(key),...item});}
 return [...merged.values()].sort((a,b)=>{
  const score=(t:TagSuggestion)=>(t.name.replaceAll('_',' ')===normalized?1000:0)+(recent.has(t.name)?200:0)+(t.source==='official'?100:0)+Math.log10((t.count??0)+1);
  return score(b)-score(a);
 }).slice(0,6);
}
export async function localTags(query:string):Promise<TagSuggestion[]>{
 const key=query.toLowerCase().replaceAll('_',' ');if(localCache.has(key))return localCache.get(key)!;
 const db=await dictionary();const rows=await db.getAllAsync<{name:string;category:number;count:number;translation:string}>(`SELECT DISTINCT t.name,t.category,t.count,t.translation FROM terms s JOIN tags t ON t.name=s.tag WHERE s.term>=? AND s.term<? ORDER BY (s.term=?) DESC,t.count DESC LIMIT 24`,key,key+'\uffff',key);
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
