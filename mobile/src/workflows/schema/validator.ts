import type { JsonSchemaSubset, ValidationError, ValidationResult, WorkflowDefinition, WorkflowWidget } from './types';

export type ValidatorContext = { adapters?: Array<{ id: string; operations: string[] }> };
const schemaKeys = new Set(['type', 'title', 'description', 'required', 'properties', 'items', 'enum', 'const', 'default', 'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'allOf', 'anyOf', 'oneOf', '$defs', '$ref', 'x-workflow.semantic', 'x-workflow.multiline', 'x-workflow.widget', 'x-workflow.acceptMime', 'x-workflow.maxItems', 'x-workflow.visibleWhen']);
const widgets = new Set<WorkflowWidget>(['text', 'textarea', 'segmented', 'select', 'stepper', 'toggle', 'number', 'seed', 'asset', 'asset-list']);
const semantics = new Set(['prompt', 'negativePrompt', 'image', 'image[]', 'audio', 'audio[]', 'video', 'text', 'number', 'integer', 'boolean', 'enum', 'seed']);
const types = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean']);

function walkSchema(value: unknown, path: string, errors: ValidationError[], depth = 0): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push({ path, code: 'SCHEMA_NODE_INVALID', message: 'schema node must be an object' }); return; }
  if (depth > 10) { errors.push({ path, code: 'SCHEMA_TOO_DEEP', message: 'schema nesting exceeds limit' }); return; }
  const node = value as Record<string, unknown>;
  for (const key of Object.keys(node)) {
    if (!schemaKeys.has(key)) errors.push({ path: `${path}.${key}`, code: key.startsWith('x-workflow.') ? 'UNKNOWN_EXTENSION' : 'UNKNOWN_SCHEMA_KEY', message: `unsupported schema key ${key}` });
  }
  if (node.type !== undefined && (typeof node.type !== 'string' || !types.has(node.type))) errors.push({ path: `${path}.type`, code: 'SCHEMA_TYPE_INVALID', message: 'unsupported schema type' });
  if (typeof node.$ref === 'string' && (node.$ref.startsWith('http://') || node.$ref.startsWith('https://'))) errors.push({ path: `${path}.$ref`, code: 'REMOTE_REF', message: 'remote references are forbidden' });
  if (node['x-workflow.widget'] !== undefined && (typeof node['x-workflow.widget'] !== 'string' || !widgets.has(node['x-workflow.widget'] as WorkflowWidget))) errors.push({ path: `${path}.x-workflow.widget`, code: 'UNKNOWN_WIDGET', message: 'unsupported workflow widget' });
  if (node['x-workflow.semantic'] !== undefined && (typeof node['x-workflow.semantic'] !== 'string' || !semantics.has(node['x-workflow.semantic'] as string))) errors.push({ path: `${path}.x-workflow.semantic`, code: 'UNKNOWN_SEMANTIC', message: 'unsupported workflow semantic' });
  if (node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)) for (const [key, child] of Object.entries(node.properties)) walkSchema(child, `${path}.properties.${key}`, errors, depth + 1);
  if (node.items !== undefined) walkSchema(node.items, `${path}.items`, errors, depth + 1);
  if (node.$defs && typeof node.$defs === 'object' && !Array.isArray(node.$defs)) for (const [key, child] of Object.entries(node.$defs)) walkSchema(child, `${path}.$defs.${key}`, errors, depth + 1);
}

export function validateWorkflowDefinition(input: unknown, context: ValidatorContext = {}): ValidationResult {
  const errors: ValidationError[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: [{ path: '', code: 'ROOT_INVALID', message: 'workflow must be an object' }] };
  const value = input as Record<string, unknown>;
  for (const field of ['schemaVersion', 'id', 'version', 'kind', 'platform', 'metadata', 'inputs', 'request', 'outputs']) if (!(field in value)) errors.push({ path: field, code: 'REQUIRED', message: `${field} is required` });
  if (value.schemaVersion !== '1.0') errors.push({ path: 'schemaVersion', code: 'SCHEMA_VERSION_UNSUPPORTED', message: 'schemaVersion must be 1.0' });
  if (value.kind === 'composite') errors.push({ path: 'kind', code: 'COMPOSITE_UNSUPPORTED', message: 'composite workflows are reserved for a later milestone' });
  const platform = value.platform as Record<string, unknown> | undefined;
  if (platform && (typeof platform.adapter !== 'string' || typeof platform.operation !== 'string')) errors.push({ path: 'platform', code: 'PLATFORM_INVALID', message: 'platform adapter and operation are required' });
  const adapter = context.adapters?.find((item) => item.id === platform?.adapter);
  if (platform && context.adapters && (!adapter || !adapter.operations.includes(String(platform.operation)))) errors.push({ path: 'platform.adapter', code: 'UNSUPPORTED_ADAPTER', message: 'adapter or operation is unavailable' });
  walkSchema(value.inputs, 'inputs', errors);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: input as WorkflowDefinition };
}
