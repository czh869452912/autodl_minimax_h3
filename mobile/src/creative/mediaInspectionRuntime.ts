import {NativeModules} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {z} from 'zod';
import {getDatabase} from '../storage/databaseClient';
import {withWriteTransaction} from '../storage/sqliteBusy';
import {scopedMedia,prepareMediaReview,dispatchMediaReview,reviewFrames} from './mediaReview';
import {createAttachmentStore} from '../media/attachments';
import {stageCreativeFile} from './fileImport';
import {readLlmConnections,assertLlmConnection,type LlmConnection} from '../settings/llmConnections';
import {createOpenAICompatibleModel} from '../agent/modelAdapter';
import {sha256File} from '../native/media';
const inspection=z.object({kind:z.enum(['image','video','audio']),sha256:z.string().regex(/^[a-f0-9]{64}$/),byteSize:z.number().nonnegative(),width:z.number().optional(),height:z.number().optional(),durationMs:z.number().optional(),hasAudio:z.boolean().optional(),frames:z.array(z.object({uri:z.string().startsWith('file://'),timestampMs:z.number().nonnegative(),width:z.number().positive(),height:z.number().positive()})).max(3)});
export type Inspection=z.infer<typeof inspection>;
export async function inspectProjectMedia(projectId:string,versionId:string){
 const db=getDatabase(),source=await scopedMedia(db,projectId,versionId);
 if(!NativeModules.AutoDLMedia?.inspectLocalMedia)throw Error('仅支持 Android 本地媒体探测');
 const result=inspection.parse(JSON.parse(await NativeModules.AutoDLMedia.inspectLocalMedia(`${FileSystem.documentDirectory}${source.relative_path}`,source.blob_sha256,source.kind)));
 if(result.sha256!==source.blob_sha256)throw Error('INSPECTION_SOURCE_CHANGED');
 await withWriteTransaction(db,async tx=>{
  if((await scopedMedia(tx,projectId,versionId)).blob_sha256!==result.sha256)throw Error('INSPECTION_SOURCE_CHANGED');
  await tx.runAsync('INSERT INTO creative_media_inspections VALUES(?,?,?,?) ON CONFLICT(version_id) DO UPDATE SET blob_sha256=excluded.blob_sha256,metadata_json=excluded.metadata_json,created_at=excluded.created_at',versionId,result.sha256,JSON.stringify({...result,frames:result.frames.map(({uri:_,...rest})=>rest)}),Date.now());
 });return result;
}
export async function prepareInspectionReview(projectId:string,versionId:string,inspected:Inspection,connection:LlmConnection,prompt:string){
 const db=getDatabase(),staging:Array<()=>Promise<void>>=[];const frames=[];
 try{
  for(const frame of inspected.frames){
   const staged=await createAttachmentStore(db,{importImage:stageCreativeFile}).externalize({type:'url',value:frame.uri,mimeType:'image/jpeg'});staging.push(staged.releaseStaging);frames.push({sha256:staged.hashes[0],timestampMs:frame.timestampMs});
  }
  return await prepareMediaReview(db,{projectId,versionId,sourceHash:inspected.sha256,connection,prompt,frames});
 }finally{for(const release of staging)await release();}
}
export async function sendInspectionReview(id:string,signal:AbortSignal){
 const db=getDatabase(),row=await db.getFirstAsync<{connection_id:string}>('SELECT connection_id FROM creative_media_reviews WHERE id=?',id);
 const connection=(await readLlmConnections()).items.find(c=>c.id===row?.connection_id);if(!connection)throw Error('REVIEW_CONNECTION_MISSING');
 await dispatchMediaReview(db,id,connection,async review=>{
  const content:Array<Record<string,unknown>>=[{type:'text',text:`审阅素材版本 ${review.version_id}，仅依据以下固定抽帧评价可见内容。用户要求：${review.prompt}\n明确证据时间点与不确定性；不能根据静帧声称已验证运动、音频或整段视频。不执行任何工具、不采用成果、不改变项目。`}];
  for(const frame of reviewFrames.parse(JSON.parse(review.frames_json))){
   const blob=await db.getFirstAsync<{relative_path:string;byte_size:number}>('SELECT relative_path,byte_size FROM artifact_blobs WHERE sha256=?',frame.sha256);
   if(!blob||blob.byte_size>2*1024*1024)throw Error('REVIEW_FRAME_MISSING');
   const uri=`${FileSystem.documentDirectory}${blob.relative_path}`;
   if(await sha256File(uri)!==frame.sha256)throw Error('REVIEW_FRAME_CHANGED');
   content.push({type:'text',text:`时间点 ${frame.timestampMs}ms`},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64})}});
  }
  let requests=0;
  const model=createOpenAICompatibleModel({apiKey:connection.apiKey,endpoint:connection.endpoint,model:connection.model,timeoutMs:120000,maxRetries:0,maxOutputTokens:1000,supportsImages:true},{beforeRequest:async()=>{
   await assertLlmConnection({connectionId:review.connection_id,connectionRevision:review.connection_revision});
   if(signal.aborted||getDatabase()!==db)throw Error('REVIEW_CANCELLED');
   const current=await db.getFirstAsync('SELECT id FROM creative_media_reviews WHERE id=? AND state=\'SENDING\' AND execution_epoch=(SELECT epoch FROM creative_execution_state WHERE id=1)',id);if(!current||++requests>1)throw Error('REVIEW_REQUEST_LIMIT');
  }});
  const response=await model.invoke([{role:'user',content}] as never,{signal});
  return {report:typeof response.content==='string'?response.content:JSON.stringify(response.content),usage:response.usage_metadata};
 });
}
