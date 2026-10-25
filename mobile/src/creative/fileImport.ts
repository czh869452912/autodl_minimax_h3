import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import CryptoJS from 'crypto-js';
import {createAttachmentStore} from '../media/attachments';
import {createArtifactCas} from '../media/cas';
import {sha256File} from '../native/media';
import {getDatabase} from '../storage/databaseClient';
import {createCreativeService} from './service';
import {createId} from '../ids';
import {CREATIVE_FILE_MIMES,creativeFileKind} from './fileFormats';
import type {CreativeAgentOrigin} from './agentScope';
const MAX_BYTES=100*1024*1024;
export async function stageCreativeFile(uri:string,mimeHint?:string){
  const mime=mimeHint??'';creativeFileKind(mime);
  if(!/^(file|content):\/\//.test(uri))throw new Error('只能导入用户选择的本地文件');
  const operationId=createId(),partUri=`${FileSystem.documentDirectory}cas/parts/${CryptoJS.SHA256(`${operationId}\u00000`).toString()}.part`;
  await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}cas/parts`,{intermediates:true});
  try{
    const source=await FileSystem.getInfoAsync(uri);
    if(!source.exists||source.isDirectory||source.size<=0||source.size>MAX_BYTES)throw new Error('文件不可用或超过 100MB');
    await FileSystem.copyAsync({from:uri,to:partUri});
    const info=await FileSystem.getInfoAsync(partUri);
    if(!info.exists||info.isDirectory||info.size!==source.size)throw new Error('文件复制不完整');
    const hash=await sha256File(partUri);
    const staged=await createArtifactCas().adoptNativePart({partUri,mime,byteSize:info.size,sha256:hash},{operationId,operationAttempt:0,mime,maxBytes:MAX_BYTES});
    return await staged.publish();
  }catch(e){await FileSystem.deleteAsync(partUri,{idempotent:true}).catch(()=>undefined);throw e;}
}
export async function importCreativeFile(file:{uri:string;name:string;mimeType?:string},projectId?:string){
  const db=getDatabase(),kind=creativeFileKind(file.mimeType??'');
  const staged=await createAttachmentStore(db,{importImage:stageCreativeFile}).externalize({type:'url',value:file.uri,mimeType:file.mimeType});
  try{
    if(!staged.hashes[0])throw new Error('FILE_IMPORT_FAILED');
    return await createCreativeService(db).execute({name:'asset.import',payload:{title:file.name.slice(0,200)||'导入文件',kind,blobSha256:staged.hashes[0],projectId,sourceUri:file.uri}},createId());
  }finally{await staged.releaseStaging();}
}
export async function pickCreativeFiles(projectId?:string){
  const picked=await DocumentPicker.getDocumentAsync({type:[...CREATIVE_FILE_MIMES],multiple:false,copyToCacheDirectory:true});
  if(picked.canceled)return 0;
  for(const file of picked.assets)await importCreativeFile(file,projectId);
  return picked.assets.length;
}
export async function saveCreativeText(input:{title:string;kind:'prompt'|'document';content:string;projectId?:string;assetId?:string;expectedRevision?:number},commandKey=createId(),origin?:CreativeAgentOrigin){
  const bytes=CryptoJS.enc.Utf8.parse(input.content).sigBytes;
  if(bytes<1||bytes>100*1024)throw new Error('文本不能为空，且不能超过 100KB');
  const uri=`${FileSystem.cacheDirectory}creative-text-${createId()}.txt`;
  await FileSystem.writeAsStringAsync(uri,input.content,{encoding:FileSystem.EncodingType.UTF8});
  const db=getDatabase();
  try{
    const staged=await createAttachmentStore(db,{importImage:stageCreativeFile}).externalize({type:'url',value:uri,mimeType:'text/plain'});
    try{
      if(!staged.hashes[0])throw new Error('TEXT_IMPORT_FAILED');
      const {content:_,...payload}=input;
      return await createCreativeService(db).execute({name:'asset.authorText',payload:{...payload,blobSha256:staged.hashes[0]}},commandKey,origin);
    }finally{await staged.releaseStaging();}
  }finally{await FileSystem.deleteAsync(uri,{idempotent:true});}
}
