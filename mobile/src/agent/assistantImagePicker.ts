import { pickImagesFromGallery, type NativeImageAsset } from '../native/imagePicker';
import { readImageAsDataSource } from './imageAttachmentUpload';
import * as DocumentPicker from 'expo-document-picker';

export type AssistantImageAttachment = {
  id: string;
  type: 'image';
  status: 'ready';
  filename: string;
  size: number;
  source: { type: 'data'; value: string; mimeType: string };
};

type Dependencies = {
  pickGallery: (remaining: number) => Promise<NativeImageAsset[]>;
  pickFiles: (remaining: number) => Promise<NativeImageAsset[]>;
  read: typeof readImageAsDataSource;
  createId: () => string;
};

const pickImagesFromFiles = async (remaining: number): Promise<NativeImageAsset[]> => {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return [];
  return result.assets.slice(0, remaining).map((asset) => ({
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? 'image/jpeg',
    size: asset.size ?? 0,
  }));
};

export async function pickAssistantImages(source: 'gallery' | 'file', remaining: number, deps: Partial<Dependencies> = {}): Promise<AssistantImageAttachment[]> {
  const resolved: Dependencies = {
    pickGallery: pickImagesFromGallery,
    pickFiles: pickImagesFromFiles,
    read: readImageAsDataSource,
    createId: () => `gallery-${Date.now()}`,
    ...deps,
  };
  const files = await (source === 'gallery' ? resolved.pickGallery : resolved.pickFiles)(remaining);
  if (files.some((file) => file.size > 20 * 1024 * 1024)) throw new Error('图片附件不能超过 20MB');
  return Promise.all(files.map(async (file) => ({
    id: resolved.createId(), type: 'image' as const, status: 'ready' as const,
    filename: file.name, size: file.size, source: await resolved.read(file),
  })));
}
