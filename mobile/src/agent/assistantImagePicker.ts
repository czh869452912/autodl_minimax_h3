import { pickImagesFromGallery, type NativeImageAsset } from '../native/imagePicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { validateImageBudget } from '../media/attachments';

export type AssistantImageAttachment = {
  id: string;
  type: 'image';
  status: 'ready';
  filename: string;
  size: number;
  source: { type: 'data' | 'url'; value: string; mimeType: string };
};

type Dependencies = {
  pickGallery: (remaining: number) => Promise<NativeImageAsset[]>;
  pickFiles: (remaining: number) => Promise<NativeImageAsset[]>;
  read: (file: NativeImageAsset) => Promise<AssistantImageAttachment['source']>;
  getSize: (uri: string) => Promise<number>;
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
    read: async file => ({ type: 'url', value: file.uri, mimeType: file.mimeType }),
    getSize: async uri => {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || info.isDirectory) throw new Error('图片已失效，请重新选择');
      return info.size;
    },
    createId: defaultAttachmentId,
    ...deps,
  };
  if (remaining <= 0) return [];
  const selected = await (source === 'gallery' ? resolved.pickGallery : resolved.pickFiles)(remaining);
  const files = await Promise.all(selected.map(async file => Number.isFinite(file.size) && file.size > 0
    ? file : { ...file, size: await resolved.getSize(file.uri) }));
  validateImageBudget(files);
  const occupied = new Set<string>();
  const ids = files.map(() => allocateUniqueAttachmentId(resolved.createId(), occupied));
  return Promise.all(files.map(async (file, index) => ({
    id: ids[index], type: 'image' as const, status: 'ready' as const,
    filename: file.name, size: file.size, source: await resolved.read(file),
  })));
}
