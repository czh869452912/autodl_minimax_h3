import * as FileSystem from 'expo-file-system/legacy';
import type { TaskMediaInput } from '../../../tasks/types';
import type { AutodlInput } from './mapping';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUDIO_MIMES = new Set(['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/flac']);
export const DEFAULT_AUTODL_RAW_MEDIA_BYTES = 50 * 1024 * 1024;

type Dependencies = { readBase64: (uri: string) => Promise<string>; maxRawBytes: number };
const defaultRead = (uri: string) => FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });

async function encodeMedia(item: TaskMediaInput, kind: 'image' | 'audio', readBase64: (uri: string) => Promise<string>): Promise<TaskMediaInput> {
  const accepted = kind === 'image' ? IMAGE_MIMES : AUDIO_MIMES;
  if (!item.mime || !accepted.has(item.mime)) throw new Error(`不支持的${kind === 'image' ? '图片' : '音频'}格式`);
  if (item.dataUri) {
    const mimePattern = item.mime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`^data:${mimePattern};base64,[A-Za-z0-9+/=]+$`, 'i').test(item.dataUri)) throw new Error('媒体 data URI 格式无效');
    return { ...item };
  }
  if (!item.uri) throw new Error('媒体缺少本地 URI');
  const encoded = await readBase64(item.uri);
  if (!/^[A-Za-z0-9+/=]+$/.test(encoded)) throw new Error('媒体 Base64 格式无效');
  return { ...item, dataUri: `data:${item.mime};base64,${encoded}` };
}

export async function prepareAutodlInput(input: AutodlInput, deps: Partial<Dependencies> = {}): Promise<AutodlInput> {
  const images = input.images ?? [];
  const audios = input.audios ?? [];
  if (images.length > 9) throw new Error('最多 9 张图片');
  if (audios.length > 3) throw new Error('最多 3 个音频');
  const maxRawBytes = deps.maxRawBytes ?? DEFAULT_AUTODL_RAW_MEDIA_BYTES;
  const totalBytes = [...images, ...audios].reduce((sum, item) => sum + (item.size ?? 0), 0);
  if (totalBytes > maxRawBytes) throw new Error('总大小超过 AutoDL 输入限制');
  const readBase64 = deps.readBase64 ?? defaultRead;
  const preparedImages: TaskMediaInput[] = [];
  for (const item of images) preparedImages.push(await encodeMedia(item, 'image', readBase64));
  const preparedAudios: TaskMediaInput[] = [];
  for (const item of audios) preparedAudios.push(await encodeMedia(item, 'audio', readBase64));
  return { ...input, images: preparedImages, audios: preparedAudios };
}
