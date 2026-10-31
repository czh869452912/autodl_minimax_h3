import {NativeModules,Platform} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type {AppDatabase} from '../storage/appDatabase';
import type {WorkflowOperation} from '../workflows/executor/types';
import {executeTimelineRender} from './timelineRender';
import {createAttachmentStore} from '../media/attachments';
import {stageCreativeFile} from './fileImport';
import type {ArtifactCasBlob} from '../media/cas';
import {createId} from '../ids';
export async function renderTimelineOperation(db:AppDatabase,operation:WorkflowOperation,owner:string){
 let release:(()=>Promise<void>)|undefined,uri:string|undefined;
 try{
  await executeTimelineRender(db,operation,owner,{now:Date.now,id:createId,
   cancel:async()=>NativeModules.AutoDLMedia?.cancelTimeline?.(operation.id),
   render:async(spec,inputs,check)=>{
    if(Platform.OS!=='android'||!NativeModules.AutoDLMedia?.renderTimeline)throw new Error('仅支持 Android 本地合成');
    await check();
    uri=await NativeModules.AutoDLMedia.renderTimeline(JSON.stringify({operationId:operation.id,spec,inputs:inputs.map(i=>({...i,uri:`${FileSystem.documentDirectory}${i.relative_path}`}))}));
    await check();
    let blob:ArtifactCasBlob|undefined;
    const staged=await createAttachmentStore(db,{importImage:async(source,mime)=>{blob=await stageCreativeFile(source,mime);return blob;}}).externalize({type:'url',value:uri,mimeType:'video/mp4'});
    release=staged.releaseStaging;
    if(!blob)throw new Error('TIMELINE_OUTPUT_NOT_STAGED');
    return blob;
   },
  });
 }finally{if(release)await release();if(uri)await FileSystem.deleteAsync(uri,{idempotent:true}).catch(()=>undefined);}
}
