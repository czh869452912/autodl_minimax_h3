import { File, Paths } from 'expo-file-system';
import type { AppDatabase } from '../storage/appDatabase';
import { getDatabase } from '../storage/databaseClient';
import { attachmentHashes, validateImageBudget } from '../media/attachments';
import type { TaskMediaInput } from '../media/types';
import { inputField, inputProperties, canonicalInputs } from '../workflows/inputModel';
import { compileWorkflow } from '../workflows/compiler/compiler';
import type { WorkflowDefinition } from '../workflows/schema/types';
import { validatePromptBindings, type PromptBindingImage } from './promptBindings';

export type PromptHandoff = {
  target?: { workflowId: string; workflowVersion: string; contentHash: string };
  prompt: string;
  images: PromptBindingImage[];
  parameters: { resolution?: string; durationSeconds?: number; seed?: string };
  source: { threadId: string; messageId: string; versionId: string; artifactId?: string; sourceRevision?: number };
};

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
  if (value.target !== undefined && (!isObject(value.target) || ['workflowId', 'workflowVersion', 'contentHash'].some(key => typeof (value.target as Record<string, unknown>)[key] !== 'string' || !(value.target as Record<string, string>)[key].trim()))) throw new Error('交接工作流身份无效');
  if (value.images.some((image) => !isObject(image) || typeof image.id !== 'string' || typeof image.displayName !== 'string'
    || typeof image.uri !== 'string' || (image.filename !== undefined && typeof image.filename !== 'string')
    || (image.ordinal !== undefined && (typeof image.ordinal !== 'number' || !Number.isSafeInteger(image.ordinal) || image.ordinal < 1))
    || (image.identityKnown !== undefined && typeof image.identityKnown !== 'boolean'))
    || Object.keys(parameters).some((key) => !['resolution', 'durationSeconds', 'seed'].includes(key))
    || (parameters.resolution !== undefined && typeof parameters.resolution !== 'string')
    || (parameters.durationSeconds !== undefined && (typeof parameters.durationSeconds !== 'number' || !Number.isFinite(parameters.durationSeconds)))
    || (parameters.seed !== undefined && typeof parameters.seed !== 'string')
    || (source.artifactId !== undefined && (typeof source.artifactId !== 'string' || !source.artifactId.trim()))
    || (source.sourceRevision !== undefined && (typeof source.sourceRevision !== 'number' || !Number.isSafeInteger(source.sourceRevision) || source.sourceRevision < 0))
    || ['threadId', 'messageId', 'versionId'].some((key) => typeof source[key] !== 'string' || !source[key].trim())) {
    throw new Error('提示词交接数据损坏，请重新导出');
  }
  return value as PromptHandoff;
}

export function resolvePromptHandoffValues(handoff: PromptHandoff, definition: WorkflowDefinition): Record<string, unknown> {
  decodePromptHandoff(handoff);
  if (!validatePromptBindings(handoff.prompt, handoff.images).ok) throw new Error('参考图片绑定缺失或不唯一，请重新绑定');
  const properties = (definition.inputs.properties ?? {}) as Record<string, Record<string, unknown>>;
  const values: Record<string, unknown> = { [inputField(definition, 'prompt')]: handoff.prompt };
  const mapping = { resolution: inputField(definition, 'resolution'), durationSeconds: inputField(definition, 'duration'), seed: inputField(definition, 'seed') };
  const seedField = inputField(definition, 'seed');
  const imageField = inputField(definition, 'images');
  for (const field of Object.values(mapping)) {
    if (properties[field]) values[field] = properties[field].default ?? (field === seedField ? '' : undefined);
  }
  for (const [key, value] of Object.entries(handoff.parameters)) {
    if (value === undefined) continue;
    const field = mapping[key as keyof typeof mapping];
    if (!properties[field]) throw new Error(`当前工作流不支持交接参数 ${field}，请返回预览修改`);
    if (field === seedField && typeof value === 'string' && value.trim() === '') { values[seedField] = ''; continue; }
    if (field === seedField && properties[seedField].type === 'integer') {
      if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('交接参数 seed 无效，请返回预览修改');
      values[seedField] = Number(value);
    } else values[field] = value;
  }
  if (!properties[inputField(definition, 'prompt')]) throw new Error('当前工作流不支持交接提示词');
  if (handoff.images.length && !properties[imageField]) throw new Error('当前工作流不支持参考图片，请返回预览修改');
  // Validate the exact active schemas, while leaving unrelated form fields untouched.
  const partialDefinition = { ...definition, inputs: { ...definition.inputs, required: [], properties: { ...properties, ...(properties[imageField] ? { [imageField]: { ...properties[imageField], items: { type: 'object' } } } : {}) } } };
  const validationValues: Record<string, unknown> = { ...values, ...(handoff.images.length ? { [imageField]: handoff.images } : {}) };
  if (validationValues[seedField] === '') delete validationValues[seedField];
  const result = compileWorkflow(partialDefinition, `handoff:${definition.id}:${definition.version}`).validateDraft(validationValues);
  if (!result.ok) throw new Error(`交接参数不合法（${result.errors.map((error) => error.path.slice(1)).join('、')}），请返回预览修改`);
  return values;
}

export function normalizePromptHandoffParameters(parameters: PromptHandoff['parameters'], definition: WorkflowDefinition): PromptHandoff['parameters'] {
  const values = canonicalInputs(definition, resolvePromptHandoffValues({ prompt: 'preview', images: [], parameters, source: { threadId: 'preview', messageId: 'preview', versionId: 'preview' } }, definition));
  return {
    ...(parameters.resolution !== undefined ? { resolution: String(values.resolution) } : {}),
    ...(parameters.durationSeconds !== undefined ? { durationSeconds: Number(values.duration) } : {}),
    ...(parameters.seed !== undefined ? { seed: String(values.seed) } : {}),
  };
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

/** Resolve already-owned CAS inputs. Applying a draft never creates a second file. */
export async function materializePromptHandoff(handoff: PromptHandoff, db: AppDatabase = getDatabase()): Promise<TaskMediaInput[]> {
  decodePromptHandoff(handoff);
  if (handoff.images.length > 9) throw new Error('参考图片最多 9 张，请返回预览调整');
  const bindings = validatePromptBindings(handoff.prompt, handoff.images);
  if (!bindings.ok) throw new Error('参考图片绑定缺失或不唯一，编号必须从图片1开始连续排列，请重新绑定');
  const prepared: TaskMediaInput[] = [];
  for (const image of bindings.images) {
    const hash = attachmentHashes(image.uri)[0];
    if (!hash) throw new Error('图片尚未保存为参考素材，请重新添加并导出');
    const blob = await db.getFirstAsync<{ mime: string; byte_size: number; relative_path: string }>('SELECT mime,byte_size,relative_path FROM artifact_blobs WHERE sha256=?', hash);
    if (!blob || blob.relative_path !== `cas/sha256/${hash.slice(0, 2)}/${hash}`) throw new Error('参考图片记录已失效，请重新添加');
    const mime = imageMime(blob.mime);
    prepared.push({ uri: new File(Paths.document, blob.relative_path).uri, name: safeName(image.displayName || image.filename || '', IMAGE_EXTENSIONS[mime]), mime, size: blob.byte_size });
  }
  validateImageBudget(prepared);
  for (const item of prepared) {
    const file = new File(item.uri!);
    if (!file.exists || file.size !== item.size) throw new Error('参考图片已失效，请重新添加');
  }
  return prepared;
}
