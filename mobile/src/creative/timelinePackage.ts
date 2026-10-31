import {NativeModules} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {getDatabase} from '../storage/databaseClient';
import {timelineManifest} from './timelines';
import {scopedMedia} from './mediaReview';
import {importCreativeFile} from './fileImport';
export async function createTimelinePackage(id:string,projectId:string){
 const db=getDatabase(),manifest=await timelineManifest(db,id,projectId),files=[];
 if(!NativeModules.AutoDLMedia?.packageTimeline)throw Error('仅支持 Android 本地工程包');
 for(const input of manifest.inputs){const source=await scopedMedia(db,projectId,input.version_id);if(source.blob_sha256!==input.blob_sha256)throw Error('PACKAGE_SOURCE_CHANGED');files.push({sha256:input.blob_sha256,uri:`${FileSystem.documentDirectory}${source.relative_path}`});}
 const uri=await NativeModules.AutoDLMedia.packageTimeline(JSON.stringify({manifest:{...manifest,inputs:manifest.inputs.map(input=>({...input,path:'media/'+input.blob_sha256}))},files}));
 try{if(db!==getDatabase())throw Error('DATABASE_CHANGED');return await importCreativeFile({uri,name:manifest.title+' · 工程包.zip',mimeType:'application/zip'},projectId);}
 finally{await FileSystem.deleteAsync(uri,{idempotent:true}).catch(()=>undefined);}
}
