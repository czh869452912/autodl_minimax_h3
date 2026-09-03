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

export function allocateUniqueAttachmentId(candidate: string, occupied: Set<string>): string {
  const base = candidate.trim() || 'assistant-image';
  let value = base;
  let suffix = 2;
  while (occupied.has(value)) value = `${base}-${suffix++}`;
  occupied.add(value);
  return value;
}

export function mergeUniqueAssistantAttachments(
  current: AssistantImageAttachment[],
  incoming: AssistantImageAttachment[],
  occupiedIds: ReadonlySet<string>,
): AssistantImageAttachment[] {
  const occupied = new Set(occupiedIds);
  for (const attachment of current) occupied.add(attachment.id);
  return [...current, ...incoming.map((attachment) => ({
    ...attachment,
    id: allocateUniqueAttachmentId(attachment.id, occupied),
  }))];
}

let attachmentSequence = 0;
function defaultAttachmentId(): string {
  attachmentSequence += 1;
  return `assistant-image-${Date.now().toString(36)}-${attachmentSequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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
    createId: defaultAttachmentId,
    ...deps,
  };
  const files = await (source === 'gallery' ? resolved.pickGallery : resolved.pickFiles)(remaining);
  if (files.some((file) => file.size > 20 * 1024 * 1024)) throw new Error('图片附件不能超过 20MB');
  const occupied = new Set<string>();
  const ids = files.map(() => allocateUniqueAttachmentId(resolved.createId(), occupied));
  return Promise.all(files.map(async (file, index) => ({
    id: ids[index], type: 'image' as const, status: 'ready' as const,
    filename: file.name, size: file.size, source: await resolved.read(file),
  })));
}
