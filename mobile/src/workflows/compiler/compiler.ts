import type { WorkflowDefinition, ValidationError, ValidationResult, JsonSchemaSubset } from '../schema/types';
import { getByJsonPointer } from './jsonPointer';

export type CompiledWorkflow = {
  definition: WorkflowDefinition;
  contentHash: string;
  validateDraft(inputs: Record<string, unknown>): ValidationResult;
  buildRequest(inputs: Record<string, unknown>): Record<string, unknown>;
};

const cache = new Map<string, CompiledWorkflow>();

function validateNode(schema: JsonSchemaSubset, value: unknown, path: string, errors: ValidationError[], depth = 0): void {
  if (depth > 20) { errors.push({ path, code: 'SCHEMA_TOO_DEEP', message: 'schema nesting exceeds limit' }); return; }
  const node = schema as Record<string, any>;
  const type = node.type as string | undefined;
  const typeOk = type === undefined || (type === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) || (type === 'array' && Array.isArray(value)) || (type === 'string' && typeof value === 'string') || (type === 'number' && typeof value === 'number' && Number.isFinite(value)) || (type === 'integer' && typeof value === 'number' && Number.isInteger(value)) || (type === 'boolean' && typeof value === 'boolean');
  if (!typeOk) { errors.push({ path, code: 'TYPE_INVALID', message: `expected ${type}` }); return; }
  if (node.enum && Array.isArray(node.enum) && !node.enum.some((item: unknown) => Object.is(item, value))) errors.push({ path, code: 'ENUM_INVALID', message: 'value is not allowed' });
  if (node.const !== undefined && !Object.is(node.const, value)) errors.push({ path, code: 'CONST_INVALID', message: 'value must equal const' });
  if (typeof value === 'string') { if (node.minLength !== undefined && value.length < node.minLength) errors.push({ path, code: 'MIN_LENGTH', message: 'value is too short' }); if (node.maxLength !== undefined && value.length > node.maxLength) errors.push({ path, code: 'MAX_LENGTH', message: 'value is too long' }); }
  if (typeof value === 'number') { if (node.minimum !== undefined && value < node.minimum) errors.push({ path, code: 'MINIMUM', message: 'value is below minimum' }); if (node.maximum !== undefined && value > node.maximum) errors.push({ path, code: 'MAXIMUM', message: 'value is above maximum' }); }
  if (Array.isArray(value)) { if (node.minItems !== undefined && value.length < node.minItems) errors.push({ path, code: 'MIN_ITEMS', message: 'too few items' }); if (node.maxItems !== undefined && value.length > node.maxItems) errors.push({ path, code: 'MAX_ITEMS', message: 'too many items' }); if (node.items && typeof node.items === 'object') value.forEach((item, index) => validateNode(node.items, item, `${path}/${index}`, errors, depth + 1)); }
  if (value && typeof value === 'object' && !Array.isArray(value)) { const object = value as Record<string, unknown>; const required = Array.isArray(node.required) ? node.required : []; for (const key of required) if (object[key] === undefined || object[key] === null || object[key] === '') errors.push({ path: `${path}/${key}`, code: 'REQUIRED', message: `${key} is required` }); if (node.properties && typeof node.properties === 'object') for (const [key, child] of Object.entries(node.properties)) if (object[key] !== undefined) validateNode(child as JsonSchemaSubset, object[key], `${path}/${key}`, errors, depth + 1); }
  for (const keyword of ['anyOf', 'oneOf']) if (Array.isArray(node[keyword])) { const matches = node[keyword].filter((child: JsonSchemaSubset) => { const nested: ValidationError[] = []; validateNode(child, value, path, nested, depth + 1); return nested.length === 0; }).length; if ((keyword === 'anyOf' && matches < 1) || (keyword === 'oneOf' && matches !== 1)) errors.push({ path, code: `${keyword.toUpperCase()}_INVALID`, message: `${keyword} constraint failed` }); }
}

export function compileWorkflow(definition: WorkflowDefinition, contentHash: string): CompiledWorkflow {
  const existing = cache.get(contentHash); if (existing && existing.definition === definition) return existing;
  const compiled: CompiledWorkflow = {
    definition, contentHash,
    validateDraft(inputs) { const errors: ValidationError[] = []; validateNode(definition.inputs, inputs, '', errors); return errors.length ? { ok: false, errors } : { ok: true, value: definition }; },
    buildRequest(inputs) { return Object.fromEntries(Object.entries(definition.request.bindings).map(([target, source]) => { const pointer = source.startsWith('/') || source === '' ? source : `/${source.split('.').join('/')}`; return [target, getByJsonPointer(inputs, pointer)]; })); },
  };
  cache.set(contentHash, compiled); return compiled;
}

export function clearWorkflowCompilerCache(): void { cache.clear(); }
