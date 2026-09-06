import { Directory, File, Paths } from 'expo-file-system';
import type { TaskMediaInput } from '../tasks/types';
import { compileWorkflow } from '../workflows/compiler/compiler';
import type { WorkflowDefinition } from '../workflows/schema/types';

export type PromptHandoff = {
  prompt: string;
  images: Array<{ id: string; displayName: string; filename?: string; uri: string }>;
  parameters: { resolution?: string; durationSeconds?: number; seed?: string };
  source: { threadId: string; messageId: string; versionId: string };
};

const MAX_BYTES = 50 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif',
};
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Storage is untrusted. Never downgrade a broken handoff into a text-only draft. */
export function decodePromptHandoff(value: unknown): PromptHandoff {
  if (!isObject(value) || typeof value.prompt !== 'string' || !Array.isArray(value.images)
    || !isObject(value.parameters) || !isObject(value.source)) throw new Error('提示词交接数据损坏，请重新导出');
  const { parameters, source } = value;
  if (value.images.some((image) => !isObject(image) || typeof image.id !== 'string' || typeof image.displayName !== 'string'
    || typeof image.uri !== 'string' || (image.filename !== undefined && typeof image.filename !== 'string'))
    || Object.keys(parameters).some((key) => !['resolution', 'durationSeconds', 'seed'].includes(key))
    || (parameters.resolution !== undefined && typeof parameters.resolution !== 'string')
    || (parameters.durationSeconds !== undefined && (typeof parameters.durationSeconds !== 'number' || !Number.isFinite(parameters.durationSeconds)))
    || (parameters.seed !== undefined && typeof parameters.seed !== 'string')
    || ['threadId', 'messageId', 'versionId'].some((key) => typeof source[key] !== 'string' || !source[key].trim())) {
    throw new Error('提示词交接数据损坏，请重新导出');
  }
  return value as PromptHandoff;
}

export function resolvePromptHandoffValues(handoff: PromptHandoff, definition: WorkflowDefinition): Record<string, unknown> {
  decodePromptHandoff(handoff);
  const properties = (definition.inputs.properties ?? {}) as Record<string, Record<string, unknown>>;
  const values: Record<string, unknown> = { prompt: handoff.prompt };
  const mapping = { resolution: 'resolution', durationSeconds: 'duration', seed: 'seed' };
  for (const field of Object.values(mapping)) {
    if (properties[field]) values[field] = properties[field].default ?? (field === 'seed' ? '' : undefined);
  }
  for (const [key, value] of Object.entries(handoff.parameters)) {
    if (value === undefined) continue;
    const field = mapping[key as keyof typeof mapping];
    if (!properties[field]) throw new Error(`当前工作流不支持交接参数 ${field}，请返回预览修改`);
    if (field === 'seed' && typeof value === 'string' && value.trim() === '') { values.seed = ''; continue; }
    if (field === 'seed' && properties.seed.type === 'integer') {
      if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('交接参数 seed 无效，请返回预览修改');
      values.seed = Number(value);
    } else values[field] = value;
  }
  if (!properties.prompt) throw new Error('当前工作流不支持交接提示词');
  if (handoff.images.length && !properties.images) throw new Error('当前工作流不支持参考图片，请返回预览修改');
  // Validate the exact active schemas, while leaving unrelated form fields untouched.
  const partialDefinition = { ...definition, inputs: { ...definition.inputs, required: [] } };
  const validationValues: Record<string, unknown> = { ...values, ...(handoff.images.length ? { images: handoff.images } : {}) };
  if (validationValues.seed === '') delete validationValues.seed;
  const result = compileWorkflow(partialDefinition, `handoff:${definition.id}:${definition.version}`).validateDraft(validationValues);
  if (!result.ok) throw new Error(`交接参数不合法（${result.errors.map((error) => error.path.slice(1)).join('、')}），请返回预览修改`);
  return values;
}

function imageMime(value: string): string {
  if (!IMAGE_EXTENSIONS[value]) throw new Error('不支持的图片类型，请重新添加 PNG、JPEG、WebP 等图片');
  return value;
}

function safeName(value: string, extension: string): string {
  const basename = value.split(/[\\/]/).pop() ?? '';
  const name = basename.replace(/[\u0000-\u001f<>:"|?*]/g, '_').replace(/^\.+/, '').slice(0, 100);
  return name || `reference.${extension}`;
}

/** No network access: sources must be embedded data or already accessible local files. */
export async function materializePromptHandoff(handoff: PromptHandoff): Promise<TaskMediaInput[]> {
  decodePromptHandoff(handoff);
  if (handoff.images.length > 9) throw new Error('参考图片最多 9 张，请返回预览调整');
  handoff.images.forEach((image, index) => {
    const label = /^图片\s*(\d+)$/.exec(image.displayName);
    if (label && Number(label[1]) !== index + 1) throw new Error('参考图片必须从图片1开始连续选择并按编号排序，以保持提示词引用一致');
  });
  let total = 0;
  const prepared = handoff.images.map((image) => {
    let mime: string;
    let size: number;
    let base64: string | undefined;
    let source: File | undefined;
    if (image.uri.startsWith('data:')) {
      const comma = image.uri.indexOf(',');
      const header = image.uri.slice(0, comma);
      const match = /^data:([^;,]+);base64$/.exec(header);
      if (!match) throw new Error('图片编码无效，请重新添加');
      mime = imageMime(match[1].toLowerCase());
      base64 = image.uri.slice(comma + 1);
      // Check length before regex/decoding to keep oversized inputs bounded.
      if (base64.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error('参考素材总计不能超过 50MB');
      if (!base64.length || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('图片编码无效，请重新添加');
      size = base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    } else {
      if (!/^(file|content):\/\//.test(image.uri)) throw new Error('图片链接尚未保存在本地，请重新添加参考图片');
      source = new File(image.uri);
      if (!source.exists || !source.size) throw new Error('参考图片已失效，请重新添加');
      const extension = (image.filename ?? image.uri).split('.').pop()?.toLowerCase();
      mime = imageMime(source.type || Object.keys(IMAGE_EXTENSIONS).find((key) => IMAGE_EXTENSIONS[key] === extension || (key === 'image/jpeg' && extension === 'jpeg')) || '');
      size = source.size;
    }
    total += size;
    if (!Number.isFinite(size) || size <= 0 || total > MAX_BYTES) throw new Error('参考素材总计不能超过 50MB');
    return { mime, size, base64, source, name: safeName(image.displayName || image.filename || '', IMAGE_EXTENSIONS[mime]) };
  });
  if (!prepared.length) return [];
  const directory = new Directory(Paths.document, 'prompt-handoffs');
  directory.create({ intermediates: true, idempotent: true });
  const created: File[] = [];
  try {
    const result: TaskMediaInput[] = [];
    for (const [index, item] of prepared.entries()) {
      const target = new File(directory, `reference-${Date.now()}-${Math.random().toString(36).slice(2)}-${index}.${IMAGE_EXTENSIONS[item.mime]}`);
      created.push(target);
      if (item.base64 !== undefined) target.write(item.base64, { encoding: 'base64' });
      else await item.source!.copy(target);
      if (!target.exists || target.size !== item.size) throw new Error('参考图片保存失败，请重新添加');
      result.push({ uri: target.uri, name: item.name, mime: item.mime, size: item.size });
    }
    return result;
  } catch (error) {
    for (const file of created) { try { if (file.exists) file.delete(); } catch { /* keep original error */ } }
    throw error;
  }
}
