import { compileWorkflow } from './compiler/compiler';
import type { ValidationError, WorkflowDefinition } from './schema/types';

export type InputProperty = Record<string, any>;
export const inputProperties = (definition: WorkflowDefinition): Record<string, InputProperty> =>
  definition.inputs.properties as Record<string, InputProperty> ?? {};

/** Bindings, not labels, identify the provider's input vocabulary. */
export function inputField(definition: WorkflowDefinition, target: string): string {
  const binding = definition.request.bindings[target];
  return binding?.startsWith('/') ? binding.slice(1).replace(/~1/g, '/').replace(/~0/g, '~') : binding ?? target;
}

export function canonicalInputs(definition: WorkflowDefinition, values: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const target of Object.keys(definition.request.bindings)) {
    const field = inputField(definition, target);
    if (values[field] !== undefined) result[target] = values[field];
  }
  return result;
}

export function normalizeWorkflowInputs(definition: WorkflowDefinition, values: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const required = definition.inputs.required as string[] ?? [];
  for (const [field, schema] of Object.entries(inputProperties(definition))) {
    let value = values[field];
    if (value === undefined) continue;
    if (typeof value === 'string') {
      if (field === inputField(definition, 'prompt') || schema['x-workflow.semantic'] === 'prompt') value = value.trim();
      if (schema.type === 'integer' || schema.type === 'number') {
        const text = String(value).trim();
        if (!text && !required.includes(field)) continue;
        if (text && (schema.type === 'integer' ? /^-?\d+$/ : /^-?(?:\d+\.?\d*|\.\d+)$/).test(text)) value = Number(text);
      }
    }
    result[field] = value;
  }
  return result;
}

export function alignWorkflowInputs(definition: WorkflowDefinition, source: Record<string, unknown>): {
  values: Record<string, unknown>; notices: string[]; errors: ValidationError[];
} {
  const canonical = { ...source };
  if (canonical.duration === undefined && canonical.durationSeconds !== undefined) canonical.duration = canonical.durationSeconds;
  delete canonical.durationSeconds;
  const properties = inputProperties(definition);
  const values: Record<string, unknown> = {};
  const notices: string[] = [];
  const consumed = new Set<string>();
  for (const [field, schema] of Object.entries(properties)) {
    const target = Object.keys(definition.request.bindings).find(key => inputField(definition, key) === field) ?? field;
    let value = canonical[target];
    if (value !== undefined) consumed.add(target);
    if (value === undefined || value === '') value = schema.default ?? (schema.type === 'array' ? [] : '');
    if ((schema.type === 'integer' || schema.type === 'number') && typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) value = Number(value);
    if (Array.isArray(schema.enum) && value !== '' && !schema.enum.includes(value)) {
      const replacement = schema.default ?? '';
      notices.push(`${schema.title ?? field}：${String(value)} 不受支持，${replacement === '' ? '请重新选择' : `已使用默认值 ${String(replacement)}`}。`);
      value = replacement;
    }
    values[field] = value;
  }
  for (const key of Object.keys(canonical)) if (!consumed.has(key) && canonical[key] !== undefined && canonical[key] !== '') {
    notices.push(`${key}：当前工作流不支持，未带入。`);
  }
  const normalized = normalizeWorkflowInputs(definition, values);
  const result = compileWorkflow(definition, `align:${definition.id}:${definition.version}`).validateDraft(normalized);
  return { values: { ...values, ...normalized }, notices, errors: result.ok ? [] : result.errors };
}

export function mediaConstraints(definition: WorkflowDefinition, target: 'images' | 'audios') {
  const field = inputField(definition, target);
  const schema = inputProperties(definition)[field];
  const defaults = target === 'images' ? ['image/jpeg', 'image/png', 'image/webp'] : ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp4'];
  const declared = schema?.items?.properties?.mime?.enum ?? schema?.['x-workflow.acceptMime'];
  return {
    field,
    minimum: Number(schema?.minItems ?? ((definition.inputs.required as string[] ?? []).includes(field) ? 1 : 0)),
    maximum: schema ? Math.min(Number(schema.maxItems ?? (target === 'images' ? 9 : 3)), target === 'images' ? 9 : 3) : 0,
    mimes: Array.isArray(declared) ? declared.filter((mime): mime is string => typeof mime === 'string' && defaults.includes(mime)) : defaults,
  };
}
