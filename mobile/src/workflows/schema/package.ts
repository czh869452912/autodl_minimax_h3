import type { ArtifactKind, JsonSchemaSubset, WorkflowDefinition } from './types';

export type WorkflowPackage = {
  apiVersion: 'workflow.autodl/v1';
  kind: 'Workflow';
  metadata: {
    id: string;
    version: string;
    title: string;
    category: 'image' | 'video' | 'audio' | 'text' | 'other';
    description?: string;
    icon?: string;
    tags?: string[];
    channel?: string;
    deprecated?: boolean;
    contentHash?: string;
  };
  spec: {
    adapter: { id: string; version: string; operation: string; workflowId?: string };
    inputSchema: JsonSchemaSubset;
    uiSchema?: { sections: Array<{ id: string; title: string; fields: string[] }> };
    bindings: Record<string, string>;
    outputs: { artifacts: Array<{ kind: ArtifactKind; from: string }> };
    capabilities?: string[];
    limits?: Record<string, number>;
    compatibility?: { minAppVersion?: string; requiredAdapterVersion?: string; artifactKinds?: ArtifactKind[] };
  };
  signature?: { keyId: string; algorithm: 'ed25519'; value: string };
};

const forbiddenKeys = new Set(['script', 'code', 'executable', 'command', 'function', 'eval', 'plugin', 'remote', 'url']);
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const pointer = (value: string): boolean => value === '' || (value.startsWith('/') && !value.split('/').some((part) => part === '__proto__' || part === 'constructor' || part === 'prototype'));
const decodePointer = (value: string): string[] => value === '' ? [] : value.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));

function scan(value: unknown, path: string): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((item, index) => scan(item, `${path}[${index}]`)); return; }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKeys.has(key.toLowerCase()) || key.startsWith('__')) throw new Error(`forbidden field at ${path}.${key}`);
    if (typeof child === 'string' && (child.startsWith('http://') || child.startsWith('https://')) && (key === '$ref' || key === 'url' || key === 'remote')) throw new Error(`remote references are forbidden at ${path}.${key}`);
    scan(child, `${path}.${key}`);
  }
}

function assertString(value: unknown, path: string): asserts value is string { if (typeof value !== 'string' || !value) throw new Error(`${path} must be a non-empty string`); }

export function parseWorkflowPackage(input: unknown): WorkflowPackage {
  scan(input, 'package');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('workflow package must be an object');
  const value = input as Record<string, any>;
  if (value.apiVersion !== 'workflow.autodl/v1') throw new Error('apiVersion must be workflow.autodl/v1');
  if (value.kind !== 'Workflow') throw new Error('kind must be Workflow');
  const metadata = value.metadata;
  if (!metadata || typeof metadata !== 'object') throw new Error('metadata is required');
  assertString(metadata.id, 'metadata.id');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(metadata.id)) throw new Error('metadata.id is invalid');
  assertString(metadata.version, 'metadata.version');
  if (!semver.test(metadata.version)) throw new Error('metadata.version is invalid');
  assertString(metadata.title, 'metadata.title');
  const spec = value.spec;
  if (!spec || typeof spec !== 'object') throw new Error('spec is required');
  const adapter = spec.adapter;
  if (!adapter || typeof adapter !== 'object') throw new Error('spec.adapter is required');
  assertString(adapter.id, 'spec.adapter.id'); assertString(adapter.version, 'spec.adapter.version'); assertString(adapter.operation, 'spec.adapter.operation');
  if (adapter.workflowId !== undefined && (typeof adapter.workflowId !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(adapter.workflowId))) throw new Error('spec.adapter.workflowId is invalid');
  if (!spec.inputSchema || typeof spec.inputSchema !== 'object' || Array.isArray(spec.inputSchema)) throw new Error('spec.inputSchema is required');
  if (!spec.bindings || typeof spec.bindings !== 'object' || Array.isArray(spec.bindings)) throw new Error('spec.bindings is required');
  const properties = (spec.inputSchema.properties && typeof spec.inputSchema.properties === 'object') ? spec.inputSchema.properties as Record<string, unknown> : {};
  for (const [target, source] of Object.entries(spec.bindings)) {
    assertString(target, 'spec.bindings target'); assertString(source, `spec.bindings.${target}`);
    if (!pointer(source)) throw new Error(`spec.bindings.${target} must be a JSON Pointer`);
    const sourceParts = decodePointer(source);
    if (sourceParts.length && !(sourceParts.length === 1 && sourceParts[0] in properties)) throw new Error(`spec.bindings.${target} references unknown input`);
  }
  const ui = spec.uiSchema;
  if (ui !== undefined) {
    if (!ui || !Array.isArray(ui.sections)) throw new Error('spec.uiSchema.sections must be an array');
    for (const section of ui.sections) {
      if (!section || typeof section.id !== 'string' || !Array.isArray(section.fields)) throw new Error('invalid uiSchema section');
      for (const field of section.fields) {
        if (typeof field !== 'string' || !pointer(field)) throw new Error('uiSchema field must be a JSON Pointer');
        const parts = decodePointer(field);
        if (parts.length !== 1 || !(parts[0] in properties)) throw new Error(`uiSchema field references unknown input: ${field}`);
      }
    }
  }
  if (!spec.outputs || !Array.isArray(spec.outputs.artifacts)) throw new Error('spec.outputs.artifacts is required');
  for (const item of spec.outputs.artifacts) { if (!item || typeof item.kind !== 'string' || !item.from || !pointer(item.from)) throw new Error('output mapping must use JSON Pointer'); }
  return input as WorkflowPackage;
}

export function packageToDefinition(pkg: WorkflowPackage): WorkflowDefinition {
  const outputPath = (value: string) => decodePointer(value).join('.');
  return {
    schemaVersion: '1.0', id: pkg.metadata.id, version: pkg.metadata.version, kind: 'atomic',
    platform: { adapter: pkg.spec.adapter.id, operation: pkg.spec.adapter.operation, workflowId: pkg.spec.adapter.workflowId },
    metadata: { title: pkg.metadata.title, category: pkg.metadata.category, description: pkg.metadata.description, icon: pkg.metadata.icon, tags: pkg.metadata.tags },
    inputs: pkg.spec.inputSchema,
    ui: pkg.spec.uiSchema ? { sections: pkg.spec.uiSchema.sections.map((section) => ({ ...section, fields: section.fields.map((field) => decodePointer(field)[0]) })) } : undefined,
    request: { operation: pkg.spec.adapter.operation, bindings: pkg.spec.bindings },
    outputs: { artifacts: pkg.spec.outputs.artifacts.map((item) => ({ ...item, from: outputPath(item.from) })) },
    compatibility: pkg.spec.compatibility,
  };
}

export function legacyDefinitionToPackage(definition: WorkflowDefinition): WorkflowPackage {
  const toPointer = (value: string) => value.startsWith('/') ? value : `/${value.split('.').map((part) => part.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
  const fields = definition.ui?.sections.map((section) => ({ ...section, fields: section.fields.map(toPointer) }));
  return { apiVersion: 'workflow.autodl/v1', kind: 'Workflow', metadata: { ...definition.metadata, id: definition.id, version: definition.version, channel: 'stable' }, spec: { adapter: { id: definition.platform.adapter, version: definition.compatibility?.requiredAdapterVersion ?? '0.0.0', operation: definition.platform.operation, workflowId: definition.platform.workflowId }, inputSchema: definition.inputs, uiSchema: fields ? { sections: fields } : undefined, bindings: Object.fromEntries(Object.entries(definition.request.bindings).map(([key, value]) => [key, toPointer(value)])), outputs: { artifacts: definition.outputs.artifacts.map((item) => ({ ...item, from: toPointer(item.from) })) }, compatibility: definition.compatibility } };
}
