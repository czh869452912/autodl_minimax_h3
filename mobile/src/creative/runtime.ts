import { getDatabase } from '../storage/databaseClient';
import { createCreativeService } from './service';
import { createAttachmentStore } from '../media/attachments';
import type { NativeImageAsset } from '../native/imagePicker';
import { createId } from '../ids';

export const creativeService = () => createCreativeService(getDatabase());
export async function importCreativeImage(image: NativeImageAsset, projectId?: string) {
  const db = getDatabase();
  const stored = await createAttachmentStore(db).externalize({ uri: image.uri, mimeType: image.mimeType, name: image.name });
  try {
    const blobSha256 = stored.hashes[0];
    if (!blobSha256) throw new Error('图片导入失败');
    return await createCreativeService(db).execute({ name: 'asset.import', payload: { title: image.name, kind: 'image', blobSha256, ...(projectId ? { projectId } : {}) } }, createId());
  } finally { await stored.releaseStaging(); }
}
