import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { TaskMediaInput } from '../tasks/types';

const MAX_BYTES = 50 * 1024 * 1024;

export async function pickTaskMedia(kind: 'image' | 'audio', remaining: number): Promise<TaskMediaInput[]> {
  if (remaining <= 0) return [];
  const result = await DocumentPicker.getDocumentAsync({ type: kind === 'image' ? 'image/*' : 'audio/*', multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return [];
  const selected = result.assets.slice(0, remaining);
  if (selected.some((asset) => (asset.size || 0) > MAX_BYTES)) throw new Error('单个参考素材不能超过 50MB');
  return Promise.all(selected.map(async (asset) => {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    return { dataUri: `data:${asset.mimeType || (kind === 'image' ? 'image/png' : 'audio/mpeg')};base64,${base64}`, name: asset.name, mime: asset.mimeType || (kind === 'image' ? 'image/png' : 'audio/mpeg') };
  }));
}
