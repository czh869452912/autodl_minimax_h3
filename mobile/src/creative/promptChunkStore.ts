import * as FileSystem from 'expo-file-system/legacy';
import type {PromptChunk} from './promptChunks';
const path=()=>`${FileSystem.documentDirectory}prompt-chunks.json`;
let tail:Promise<unknown>=Promise.resolve();
export async function readPromptChunks():Promise<PromptChunk[]>{
 await tail.catch(()=>undefined);
 if(!(await FileSystem.getInfoAsync(path())).exists)return [];
 const value=JSON.parse(await FileSystem.readAsStringAsync(path()));
 if(!Array.isArray(value)||value.length>50||value.some(c=>typeof c.name!=='string'||!c.name.trim()||c.name.length>80||typeof c.text!=='string'||c.text.length>10000))throw new Error('本地片段库格式无效');
 return value;
}
export function savePromptChunks(chunks:PromptChunk[]){
 const payload=JSON.stringify(chunks);
 const next=tail.catch(()=>undefined).then(async()=>{await FileSystem.writeAsStringAsync(path()+'.tmp',payload);await FileSystem.moveAsync({from:path()+'.tmp',to:path()});});
 tail=next;return next;
}
