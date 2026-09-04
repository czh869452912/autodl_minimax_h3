import { compileWorkflow } from '../workflows/compiler/compiler';
import type { RegistryRecord } from '../workflows/registry/types';
import type { ValidationError, WorkflowDefinition } from '../workflows/schema/types';

export type SubmissionFieldError = {
  field?: string;
  path: string;
  code: string;
  message: string;
  value?: unknown;
};

type SubmissionValidationResult =
  | { ok: true }
  | { ok: false; fieldErrors: SubmissionFieldError[]; summary: string };

function fieldForPath(path: string, definition: WorkflowDefinition): string | undefined {
  const match = path.match(/^\/([^/]+)$/);
  if (!match) return undefined;
  const field = match[1];
  return Object.prototype.hasOwnProperty.call(definition.inputs.properties ?? {}, field) ? field : undefined;
}

function propertyFor(error: SubmissionFieldError, definition: WorkflowDefinition): Record<string, unknown> | undefined {
  if (!error.field) return undefined;
  return (definition.inputs.properties as Record<string, Record<string, unknown>> | undefined)?.[error.field];
}

export function formatSubmissionFieldError(error: SubmissionFieldError, definition: WorkflowDefinition): string {
  if (error.code === 'WORKFLOW_CHANGED') return error.message;
  const schema = propertyFor(error, definition);
  const label = String(schema?.title ?? error.field ?? (error.path || '参数'));
  if (error.code === 'MAX_LENGTH' && typeof error.value === 'string' && typeof schema?.maxLength === 'number') {
    return `${label}最多 ${schema.maxLength.toLocaleString()} 个字符，当前 ${error.value.length.toLocaleString()} 个。`;
  }
  if (error.code === 'MIN_LENGTH' && typeof schema?.minLength === 'number') return `${label}至少需要 ${schema.minLength.toLocaleString()} 个字符。`;
  if (error.code === 'MINIMUM' && typeof schema?.minimum === 'number') return `${label}不能小于 ${schema.minimum.toLocaleString()}。`;
  if (error.code === 'MAXIMUM' && typeof schema?.maximum === 'number') return `${label}不能大于 ${schema.maximum.toLocaleString()}。`;
  if (error.code === 'ENUM_INVALID') return `${label}选项无效，请重新选择。`;
  if (error.code === 'MAX_ITEMS' && typeof schema?.maxItems === 'number') return `${label}最多可添加 ${schema.maxItems.toLocaleString()} 项。`;
  if (error.code === 'MIN_ITEMS' && typeof schema?.minItems === 'number') return `${label}至少需要 ${schema.minItems.toLocaleString()} 项。`;
  if (error.code === 'TYPE_INVALID') return `${label}的格式不正确。`;
  if (error.code === 'REQUIRED') return `${label}为必填项。`;
  return error.field ? `${label}设置不合法。` : error.message;
}

function valueAtPath(inputs: Record<string, unknown>, path: string): unknown {
  const match = path.match(/^\/([^/]+)$/);
  return match ? inputs[match[1]] : undefined;
}

function normalizeError(error: ValidationError, definition: WorkflowDefinition, inputs: Record<string, unknown>): SubmissionFieldError {
  return {
    field: fieldForPath(error.path, definition),
    path: error.path,
    code: error.code,
    message: error.message,
    value: valueAtPath(inputs, error.path),
  };
}

export function validateSubmissionBeforeQueue(input: {
  definition: WorkflowDefinition;
  loaded: RegistryRecord;
  active: RegistryRecord | undefined;
  inputs: Record<string, unknown>;
}): SubmissionValidationResult {
  const { definition, loaded, active, inputs } = input;
  const provenanceMatches = active
    && loaded.workflowId === definition.id
    && loaded.version === definition.version
    && active.workflowId === loaded.workflowId
    && active.version === loaded.version
    && active.contentHash === loaded.contentHash;
  if (!provenanceMatches) {
    const changed: SubmissionFieldError = { path: '', code: 'WORKFLOW_CHANGED', message: '工作流已更新，请重新打开创建页' };
    return { ok: false, fieldErrors: [changed], summary: changed.message };
  }

  const result = compileWorkflow(definition, loaded.contentHash).validateDraft(inputs);
  if (result.ok) return { ok: true };
  const fieldErrors = result.errors.map((error) => normalizeError(error, definition, inputs));
  return { ok: false, fieldErrors, summary: fieldErrors.map((error) => formatSubmissionFieldError(error, definition)).join('\n') };
}
