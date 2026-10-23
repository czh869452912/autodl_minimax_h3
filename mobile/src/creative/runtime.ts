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
    return await createCreativeService(db).execute({ name: 'asset.import', payload: { title: image.name, kind: 'image', blobSha256, sourceUri: image.uri, ...(projectId ? { projectId } : {}) } }, createId());
  } finally { await stored.releaseStaging(); }
}
