import { CORE_SCHEMA, load as parseYaml } from 'js-yaml';

export function parseWorkflowImport(text: string, format: 'json' | 'yaml', options: { maxBytes?: number } = {}): unknown {
  const maxBytes = options.maxBytes ?? 256 * 1024;
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('workflow config is too large');
  const value = format === 'json' ? JSON.parse(text) : parseYaml(text, { schema: CORE_SCHEMA, json: false });
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('workflow config must be an object');
  return value;
}
