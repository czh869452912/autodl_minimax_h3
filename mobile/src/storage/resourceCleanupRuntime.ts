import * as FileSystem from 'expo-file-system/legacy';
import type {AppDatabase} from './appDatabase';
import {cleanupCandidates,runResourceCleanup,safeCleanupPath,type CleanupFiles,type CleanupFile} from './resourceCleanup';
import {readPendingMaintenance} from './pendingMaintenance';

function files():CleanupFiles{
 const absolute=(path:string)=>path.startsWith('cache/')?`${FileSystem.cacheDirectory}${path.slice(6)}`:`${FileSystem.documentDirectory}${path}`;
 return {
  async list(){
   const found:CleanupFile[]=[];
   const walk=async(prefix:string,depth:number)=>{
    const directory=await FileSystem.getInfoAsync(absolute(prefix));if(!directory.exists)return;
    for(const name of await FileSystem.readDirectoryAsync(absolute(prefix))){
     if(!/^[A-Za-z0-9_.-]+$/.test(name)||name==='.'||name==='..')continue;
     const path=prefix+name,info=await FileSystem.getInfoAsync(absolute(path));if(!info.exists)continue;
     if(info.isDirectory){if(depth>0)await walk(path+'/',depth-1);}else if(safeCleanupPath(path))found.push({path,size:info.size,modifiedAt:info.modificationTime*1000});
    }
   };
   for(const [prefix,depth] of [['cas/sha256/',1],['cas/parts/',0],['creative-responses/',1],['cache/creative-previews/',0]] as const)await walk(prefix,depth);
   return found;
  },
  async remove(path){if(!safeCleanupPath(path))throw Error('UNSAFE_CLEANUP_PATH');await FileSystem.deleteAsync(absolute(path),{idempotent:true});},
 };
}
export async function inspectResourceCleanup(db:AppDatabase){const rows=await cleanupCandidates(db,files());return {count:rows.length,bytes:rows.reduce((n,r)=>n+r.size,0)};}
export async function lastResourceCleanup(){
 try{return JSON.parse(await FileSystem.readAsStringAsync(`${FileSystem.documentDirectory}resource-cleanup-result.json`)) as {deleted:number;bytes:number;failed:number;completedAt:number};}catch{return undefined;}
}
export async function performResourceCleanup(db:AppDatabase){
 if((await readPendingMaintenance())?.kind!=='resource-cleanup')throw Error('CLEANUP_REQUIRES_STARTUP');
 const result=await runResourceCleanup(db,files());
 await FileSystem.writeAsStringAsync(`${FileSystem.documentDirectory}resource-cleanup-result.json`,JSON.stringify({...result,completedAt:Date.now()}));
 return result;
}
