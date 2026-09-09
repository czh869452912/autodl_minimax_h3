import * as DocumentPicker from 'expo-document-picker';
import type { TaskMediaInput } from '../media/types';
import { pickImagesFromGallery } from '../native/imagePicker';

const MAX_BYTES = 50 * 1024 * 1024;

export async function pickTaskMedia(kind: 'image' | 'audio', remaining: number, source: 'gallery' | 'file' = 'file', acceptedMimes?: string[]): Promise<TaskMediaInput[]> {
  if (remaining <= 0) return [];
  if (kind === 'image' && source === 'gallery') {
    const selected = await pickImagesFromGallery(remaining);
    if (acceptedMimes && selected.some(asset => !acceptedMimes.includes(asset.mimeType))) throw new Error('所选图片格式不受当前工作流支持');
    if (selected.some((asset) => asset.size > MAX_BYTES)) throw new Error('单个参考素材不能超过 50MB');
    return selected.map((asset) => ({ uri: asset.uri, name: asset.name, size: asset.size, mime: asset.mimeType }));
  }
  const result = await DocumentPicker.getDocumentAsync({ type: acceptedMimes ?? (kind === 'image' ? 'image/*' : 'audio/*'), multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return [];
  const selected = result.assets.slice(0, remaining);
  if (acceptedMimes && selected.some(asset => !asset.mimeType || !acceptedMimes.includes(asset.mimeType))) throw new Error('所选素材格式不受当前工作流支持，请选择标注格式的文件');
  if (selected.some((asset) => (asset.size || 0) > MAX_BYTES)) throw new Error('单个参考素材不能超过 50MB');
  return selected.map((asset) => ({ uri: asset.uri, name: asset.name, size: asset.size, mime: asset.mimeType || (kind === 'image' ? 'image/png' : 'audio/mpeg') }));
}
