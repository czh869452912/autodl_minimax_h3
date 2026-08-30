import { Text, View } from 'react-native';
import type { WorkflowDefinition } from '../schema/types';
import { createDefaultRendererRegistry } from './registry';
import type { FieldRenderContext } from './types';

export function WorkflowForm({ definition, value, errors = [], onChange }: { definition: WorkflowDefinition; value: Record<string, unknown>; errors?: Array<{ path: string; message: string }>; onChange(value: Record<string, unknown>): void }) {
  const registry = createDefaultRendererRegistry();
  const properties = (definition.inputs.properties ?? {}) as Record<string, Record<string, unknown>>;
  const fields = definition.ui?.sections.flatMap((section) => section.fields) ?? Object.keys(properties);
  return <View>{(definition.ui?.sections ?? [{ id: 'default', title: '', fields }]).map((section) => <View key={section.id}>{section.title ? <Text>{section.title}</Text> : null}{section.fields.map((path) => { const schema = properties[path] ?? {}; const semantic = String(schema['x-workflow.semantic'] ?? schema.type) as never; const renderer = registry.get(semantic); if (!renderer) return null; const error = errors.find((item) => item.path === path); const context: FieldRenderContext = { path, label: String(schema.title ?? path), schema, value: value[path], error: error?.message, onChange: (next) => onChange({ ...value, [path]: next }) }; return <View key={path}>{renderer.render(context)}</View>; })}</View>)}</View>;
}
