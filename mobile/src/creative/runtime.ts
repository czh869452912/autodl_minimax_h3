import {auditCreativeMigration} from './migrationAudit';
import { getDatabase } from '../storage/databaseClient';
import { createCreativeService } from './service';
import { createAttachmentStore } from '../media/attachments';
import type { NativeImageAsset } from '../native/imagePicker';
import { createId } from '../ids';
import { executorWakePort } from '../tasks/executorEvents';
import * as FileSystem from 'expo-file-system/legacy';
import { sha256File } from '../native/media';
import { createFileResources } from './fileResources';
import { findCreativeBackupFile } from '../storage/creativeBackupRuntime';
import { migrateLegacyCreativeBatch } from './legacyMigration';
import { NativeModules } from 'react-native';
import { stageCreativeFile } from './fileImport';
import * as DocumentPicker from 'expo-document-picker';

export async function migrateCreativeHistory(db = getDatabase()) {
  const result=await migrateLegacyCreativeBatch(db, { importLocal: async (uri, mimeType) => {
    const staged = await createAttachmentStore(db,{importImage:stageCreativeFile}).externalize({ type:'url',value:uri,mimeType });
    return { hash: staged.hashes[0] ?? '', release: staged.releaseStaging };
  } }, 5);
  return {...result,audit:await auditCreativeMigration(db)};
}

export const creativeService = () => createCreativeService(getDatabase());
export const creativeFiles = () => createFileResources(getDatabase(), { now: Date.now, verify: async (path, hash) => await sha256File(`${FileSystem.documentDirectory}${path}`) === hash });
export async function restoreCreativeImage(versionId: string, image: NativeImageAsset, backupId?: string) {
  return creativeFiles().restore(versionId, { sourceUri: image.uri, backupId, importFile: async () => {
    const staged = await createAttachmentStore(getDatabase()).externalize({ uri: image.uri, mimeType: image.mimeType, name: image.name });
    return { hash: staged.hashes[0] ?? '', release: staged.releaseStaging };
  } });
}
export async function restoreCreativeImageFromBackup(versionId: string) {
  const resource = await creativeFiles().read(versionId);
  if (!resource?.expected_sha256 || !resource.mime?.startsWith('image/')) throw new Error('没有可恢复的原始图片记录');
  const file = await findCreativeBackupFile(resource.expected_sha256);
  if (!file) throw new Error('备份中未找到完好的原图，请重新选择原始文件');
  return restoreCreativeImage(versionId, { uri: file.uri, mimeType: resource.mime, size: file.size, name: 'restored-image' }, file.backupId);
}
export async function restoreCreativeFile(versionId:string,file:{uri:string;mimeType:string},backupId?:string){
  const db=getDatabase();
  return creativeFiles().restore(versionId,{sourceUri:file.uri,backupId,importFile:async()=>{
    const staged=await createAttachmentStore(db,{importImage:stageCreativeFile}).externalize({type:'url',value:file.uri,mimeType:file.mimeType});
    return {hash:staged.hashes[0]??'',release:staged.releaseStaging};
  }});
}
export async function locateCreativeFile(versionId:string){
  const resource=await creativeFiles().read(versionId);
  if(!resource?.expected_sha256||!resource.mime)throw new Error('原件哈希未知，无法确认替换文件；请作为新资产导入');
  const result=await DocumentPicker.getDocumentAsync({type:resource.mime,multiple:false,copyToCacheDirectory:true});
  if(!result.canceled&&result.assets[0])await restoreCreativeFile(versionId,{uri:result.assets[0].uri,mimeType:resource.mime});
}
export async function restoreCreativeFileFromBackup(versionId:string){
  const resource=await creativeFiles().read(versionId);
  if(!resource?.expected_sha256||!resource.mime)throw new Error('原件哈希未知，无法确定备份文件');
  const file=await findCreativeBackupFile(resource.expected_sha256);
  if(!file)throw new Error('未找到内容匹配的完整备份文件');
  return restoreCreativeFile(versionId,{uri:file.uri,mimeType:resource.mime},file.backupId);
}
export async function exportCreativeVersion(versionId: string, generation = 1) {
  const result = await creativeService().execute({ name: 'asset.export', payload: { versionId, generation } }, `export:${versionId}:${generation}`);
  executorWakePort.signal('command');
  return result;
}
export async function importCreativeImage(image: NativeImageAsset, projectId?: string) {
  const db = getDatabase();
  const stored = await createAttachmentStore(db).externalize({ uri: image.uri, mimeType: image.mimeType, name: image.name });
  try {
    const blobSha256 = stored.hashes[0];
    if (!blobSha256) throw new Error('图片导入失败');
    let metadata: Record<string,string> | undefined;
    try { metadata = await NativeModules.AutoDLMedia?.readCreativePngMetadata?.(image.uri); } catch { /* Keep original bytes even when metadata is corrupt. */ }
    return await createCreativeService(db).execute({ name: 'asset.import', payload: { title: image.name, kind: 'image', blobSha256, sourceUri: image.uri, metadata, ...(projectId ? { projectId } : {}) } }, createId());
  } finally { await stored.releaseStaging(); }
}
