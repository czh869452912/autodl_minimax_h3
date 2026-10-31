import CryptoJS from 'crypto-js';
import {z} from 'zod';
import type {AppDatabase} from '../storage/appDatabase';
import {withWriteTransaction} from '../storage/sqliteBusy';
import type {LlmConnection} from '../settings/llmConnections';
import {createId} from '../ids';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const reviewFrames=z.array(z.object({sha256:hash,timestampMs:z.number().int().nonnegative()}).strict()).min(1).max(3);
export type ReviewRow={id:string;project_id:string;version_id:string;source_hash:string;connection_id:string;connection_revision:number;model:string;endpoint_hash:string;prompt:string;frames_json:string;execution_epoch:string;state:string;report:string|null;usage_json:string|null;created_at:number;approved_at:number|null};
export async function scopedMedia(db:AppDatabase,projectId:string,versionId:string){
 const row=await db.getFirstAsync<{version_id:string;blob_sha256:string;kind:string;relative_path:string}>(`SELECT v.id AS version_id,f.blob_sha256,a.kind,b.relative_path FROM creative_asset_versions v JOIN creative_assets a ON a.id=v.asset_id JOIN creative_project_assets p ON p.asset_id=a.id AND p.project_id=?
 JOIN creative_version_files f ON f.version_id=v.id AND f.role='original' AND f.state='AVAILABLE' JOIN creative_file_resources r ON r.version_id=v.id AND r.role='original' AND r.state='AVAILABLE' JOIN artifact_blobs b ON b.sha256=f.blob_sha256
 WHERE v.id=? AND a.kind IN ('image','video','audio') AND NOT EXISTS(SELECT 1 FROM creative_asset_trash t WHERE t.asset_id=a.id)`,projectId,versionId);
 if(!row)throw Error('REVIEW_SOURCE_UNAVAILABLE');return row;
}
export async function prepareMediaReview(db:AppDatabase,input:{projectId:string;versionId:string;sourceHash:string;connection:LlmConnection;prompt:string;frames:z.infer<typeof reviewFrames>},now=Date.now()){
 const frames=reviewFrames.parse(input.frames),prompt=z.string().trim().min(1).max(1500).parse(input.prompt),c=input.connection;
 if(c.revoked||!c.images)throw Error('REVIEW_IMAGE_CAPABILITY_REQUIRED');
 return withWriteTransaction(db,async tx=>{
  const source=await scopedMedia(tx,input.projectId,input.versionId);if(source.blob_sha256!==input.sourceHash||source.kind==='audio')throw Error('REVIEW_SOURCE_CHANGED');
  if(!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',input.projectId))throw Error('PROJECT_NOT_AVAILABLE');
  for(const frame of frames)if(!await tx.getFirstAsync("SELECT sha256 FROM artifact_blobs WHERE sha256=? AND mime='image/jpeg' AND byte_size<=2097152",frame.sha256))throw Error('REVIEW_FRAME_INVALID');
  const id=createId(),epoch=(await tx.getFirstAsync<{epoch:string}>('SELECT epoch FROM creative_execution_state WHERE id=1'))!.epoch;
  await tx.runAsync("INSERT INTO creative_media_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,'PREPARED',NULL,NULL,?,NULL)",id,input.projectId,input.versionId,input.sourceHash,c.id,c.revision,c.model,CryptoJS.SHA256(c.endpoint).toString(),prompt,JSON.stringify(frames),epoch,now);
  for(const frame of frames)await tx.runAsync("INSERT OR IGNORE INTO artifact_blob_refs VALUES(?,'creative_review',?,?)",frame.sha256,id,now);
  return id;
 });
}
export async function dispatchMediaReview(db:AppDatabase,id:string,connection:LlmConnection,send:(row:ReviewRow)=>Promise<{report:string;usage?:unknown}>,now=Date.now()){
 const row=await withWriteTransaction(db,async tx=>{
  const row=await tx.getFirstAsync<ReviewRow>('SELECT * FROM creative_media_reviews WHERE id=?',id);
  if(!row||row.state!=='PREPARED'||now-row.created_at>15*60000)throw Error('REVIEW_PREPARATION_EXPIRED');
  const epoch=(await tx.getFirstAsync<{epoch:string}>('SELECT epoch FROM creative_execution_state WHERE id=1'))!.epoch;
  if(row.execution_epoch!==epoch||connection.revoked||!connection.images||connection.id!==row.connection_id||connection.revision!==row.connection_revision||connection.model!==row.model||CryptoJS.SHA256(connection.endpoint).toString()!==row.endpoint_hash)throw Error('REVIEW_CONNECTION_CHANGED');
  if((await scopedMedia(tx,row.project_id,row.version_id)).blob_sha256!==row.source_hash)throw Error('REVIEW_SOURCE_CHANGED');
  if(!await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL',row.project_id))throw Error('PROJECT_NOT_AVAILABLE');
  await tx.runAsync("UPDATE creative_media_reviews SET state='SENDING',approved_at=? WHERE id=?",now,id);return row;
 });
 try{
  const result=await send(row);
  await withWriteTransaction(db,async tx=>{
   const changed=await tx.runAsync("UPDATE creative_media_reviews SET state='DONE',report=?,usage_json=? WHERE id=? AND state='SENDING' AND execution_epoch=(SELECT epoch FROM creative_execution_state WHERE id=1)",result.report.slice(0,16000),JSON.stringify(result.usage??null),id);
   if(changed.changes!==1)throw Error('REVIEW_AUTHORITY_LOST');
  });
 }catch(e){await db.runAsync("UPDATE creative_media_reviews SET state='UNKNOWN' WHERE id=? AND state='SENDING'",id);throw e;}
}
