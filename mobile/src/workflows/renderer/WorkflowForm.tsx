import { Text, View } from 'react-native';
import type { WorkflowDefinition } from '../schema/types';
import type { FieldSemantic } from '../schema/types';
import { createDefaultRendererRegistry } from './registry';
import type { FieldRenderContext } from './types';

export function WorkflowForm({ definition, value, errors = [], onChange, overrides = {} }: { definition: WorkflowDefinition; value: Record<string, unknown>; errors?: Array<{ path: string; message: string }>; onChange(value: Record<string, unknown>): void; overrides?: Partial<Record<FieldSemantic, (ctx: FieldRenderContext) => React.ReactNode>> }) {
  const registry = createDefaultRendererRegistry();
  const properties = (definition.inputs.properties ?? {}) as Record<string, Record<string, unknown>>;
  const fields = definition.ui?.sections.flatMap((section) => section.fields) ?? Object.keys(properties);
  return <View>{(definition.ui?.sections ?? [{ id: 'default', title: '', fields }]).map((section) => <View key={section.id}>{section.title ? <Text>{section.title}</Text> : null}{section.fields.map((path) => { const schema = properties[path] ?? {}; const semantic = String(schema['x-workflow.semantic'] ?? schema.type) as FieldSemantic; const renderer = registry.get(semantic); if (!renderer) return null; const error = errors.find((item) => item.path === path); const context: FieldRenderContext = { path, label: String(schema.title ?? path), schema, value: value[path], error: error?.message, onChange: (next) => onChange({ ...value, [path]: next }) }; return <View key={path}>{overrides[semantic]?.(context) ?? renderer.render(context)}</View>; })}</View>)}</View>;
}
