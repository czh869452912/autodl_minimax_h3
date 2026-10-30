import type {AppDatabase} from './appDatabase';
import CryptoJS from 'crypto-js';

export type CleanupFile={path:string;size:number;modifiedAt:number};
export type CleanupFiles={list():Promise<CleanupFile[]>;remove(path:string):Promise<void>};
export const cleanupAge=24*60*60*1000;
export const safeCleanupPath=(path:string)=>/^cas\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(path)||/^cas\/parts\/[A-Za-z0-9_.-]+$/.test(path)||/^creative-responses\/[a-f0-9]{64}\/(response\.(json|sha256|part)|response\.sha256\.part)$/.test(path)||/^cache\/creative-previews\/[A-Za-z0-9_.-]+$/.test(path);
/** Keep send markers forever: losing one can permit a second paid submission. */
export async function cleanupCandidates(db:AppDatabase,files:CleanupFiles,now=Date.now()){
 const blobs=await db.getAllAsync<{relative_path:string}>('SELECT relative_path FROM artifact_blobs');
 const protectedPaths=new Set(blobs.map(b=>b.relative_path));
 const jobs=await db.getAllAsync<{id:string}>('SELECT id FROM workflow_jobs');
 const receipts=new Set(jobs.map(j=>CryptoJS.SHA256(`novelai:${j.id}`).toString()));
 const active=await db.getFirstAsync("SELECT id FROM workflow_operations WHERE state NOT IN ('SUCCEEDED','FAILED','CANCELLED') LIMIT 1");
 return (await files.list()).filter(f=>{
  if(!safeCleanupPath(f.path)||!Number.isFinite(f.modifiedAt)||f.modifiedAt>now-cleanupAge)return false;
  if(f.path.startsWith('cache/creative-previews/'))return true;
  if(active)return false;
  if(f.path.startsWith('cas/parts/'))return true;
  if(f.path.startsWith('cas/sha256/'))return !protectedPaths.has(f.path);
  return !receipts.has(f.path.split('/')[1]);
 });
}
/** Called only before app writers mount; re-scan rather than trusting a UI estimate. */
export async function runResourceCleanup(db:AppDatabase,files:CleanupFiles,now=Date.now()){
 let deleted=0,bytes=0,failed=0;
 for(const file of await cleanupCandidates(db,files,now)){
  try{await files.remove(file.path);deleted++;bytes+=file.size;}catch{failed++;}
 }
 return {deleted,bytes,failed};
}
