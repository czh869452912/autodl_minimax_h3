import type { FieldSemantic } from '../schema/types';
import type { FieldRenderer } from './types';
import { renderField } from './renderers';

export function createDefaultRendererRegistry(): Map<FieldSemantic, FieldRenderer> {
  return new Map((['prompt', 'negativePrompt', 'image', 'image[]', 'audio', 'audio[]', 'video', 'text', 'number', 'integer', 'boolean', 'enum', 'seed'] as FieldSemantic[]).map((semantic) => [semantic, { semantic, render: renderField }]));
}
