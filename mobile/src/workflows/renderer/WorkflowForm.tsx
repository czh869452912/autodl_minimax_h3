import { StyleSheet, Text, View } from 'react-native';
import type { WorkflowDefinition } from '../schema/types';
import type { FieldSemantic } from '../schema/types';
import { createDefaultRendererRegistry } from './registry';
import type { FieldRenderContext } from './types';
import { COLORS, SPACING } from '../../ui/theme';

export function WorkflowForm({ definition, value, errors = [], onChange, overrides = {} }: { definition: WorkflowDefinition; value: Record<string, unknown>; errors?: Array<{ path: string; message: string }>; onChange(value: Record<string, unknown>): void; overrides?: Partial<Record<FieldSemantic, (ctx: FieldRenderContext) => React.ReactNode>> }) {
  const registry = createDefaultRendererRegistry();
  const properties = (definition.inputs.properties ?? {}) as Record<string, Record<string, unknown>>;
  const fields = definition.ui?.sections.flatMap((section) => section.fields) ?? Object.keys(properties);
  return <View style={styles.root}>{(definition.ui?.sections ?? [{ id: 'default', title: '', fields }]).map((section) => <View key={section.id} style={styles.section}>{section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}{section.fields.map((path) => { const schema = properties[path] ?? {}; const semantic = String(schema['x-workflow.semantic'] ?? schema.type) as FieldSemantic; const renderer = registry.get(semantic); if (!renderer) return null; const error = errors.find((item) => item.path === path); const context: FieldRenderContext = { path, label: String(schema.title ?? path), schema, value: value[path], error: error?.message, onChange: (next) => onChange({ ...value, [path]: next }) }; return <View key={path}>{overrides[semantic]?.(context) ?? renderer.render(context)}</View>; })}</View>)}</View>;
}

const styles = StyleSheet.create({
  root: { gap: SPACING.lg },
  section: { backgroundColor: `${COLORS.surface}cc`, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: SPACING.lg, gap: SPACING.lg },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
});
