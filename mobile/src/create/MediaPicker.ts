import * as DocumentPicker from 'expo-document-picker';
import type { TaskMediaInput } from '../media/types';
import { pickImagesFromGallery } from '../native/imagePicker';

const MAX_BYTES = 50 * 1024 * 1024;

export async function pickTaskMedia(kind: 'image' | 'audio', remaining: number, source: 'gallery' | 'file' = 'file', acceptedMimes?: string[], onSkipped?: (messages: string[]) => void, budget = MAX_BYTES): Promise<TaskMediaInput[]> {
  if (remaining <= 0) return [];
  let candidates: TaskMediaInput[];
  if (kind === 'image' && source === 'gallery') candidates = (await pickImagesFromGallery(remaining)).map(asset => ({ uri: asset.uri, name: asset.name, size: asset.size, mime: asset.mimeType }));
  else {
    const result = await DocumentPicker.getDocumentAsync({ type: acceptedMimes ?? (kind === 'image' ? 'image/*' : 'audio/*'), multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return [];
    candidates = result.assets.map(asset => ({ uri: asset.uri, name: asset.name, size: asset.size, mime: asset.mimeType }));
  }
  const accepted: TaskMediaInput[] = [], skipped: string[] = [];
  let bytes = 0;
  for (const item of candidates) {
    const reason = acceptedMimes && (!item.mime || !acceptedMimes.includes(item.mime)) ? '格式不支持' : (item.size ?? 0) > MAX_BYTES ? '单个文件超过 50MB' : accepted.length >= remaining ? '超过数量上限' : bytes + (item.size ?? 0) > budget ? '全部素材超过 50MB' : '';
    if (reason) skipped.push(`${item.name || '未命名文件'}：${reason}`);
    else { accepted.push(item); bytes += item.size ?? 0; }
  }
  if (skipped.length) onSkipped?.(skipped);
  return accepted;
}
