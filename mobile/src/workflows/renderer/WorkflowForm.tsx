import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { WorkflowDefinition } from '../schema/types';
import type { FieldSemantic } from '../schema/types';
import { createDefaultRendererRegistry } from './registry';
import type { FieldRenderContext } from './types';
import { COLORS, SPACING } from '../../ui/theme';

function fieldSemantic(schema: Record<string, unknown>): FieldSemantic {
  if (typeof schema['x-workflow.semantic'] === 'string') return schema['x-workflow.semantic'] as FieldSemantic;
  if (Array.isArray(schema.enum)) return 'enum';
  return schema.type === 'string' ? 'text' : schema.type as FieldSemantic;
}

const registry = createDefaultRendererRegistry();

export function WorkflowForm({ definition, value, errors = [], disabled = false, scrollRef, onChange, overrides = {} }: { definition: WorkflowDefinition; disabled?: boolean; scrollRef?: React.RefObject<ScrollView | null>; value: Record<string, unknown>; errors?: Array<{ path: string; message: string }>; onChange(value: Record<string, unknown>): void; overrides?: Partial<Record<FieldSemantic, (ctx: FieldRenderContext) => React.ReactNode>> }) {
  const fieldsRef = useRef(new Map<string, View>());
  const inputsRef = useRef(new Map<string, TextInput>());
  const firstError = errors[0]?.path;
  useEffect(() => {
    if (!firstError || !scrollRef?.current) return;
    const input = inputsRef.current.get(firstError);
    fieldsRef.current.get(firstError)?.measureLayout?.(scrollRef.current.getInnerViewNode(), (_x, y) => { scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true }); input?.focus(); }, () => input?.focus());
  }, [firstError, scrollRef]);
  const properties = (definition.inputs.properties ?? {}) as Record<string, Record<string, unknown>>;
  const fields = definition.ui?.sections.flatMap((section) => section.fields) ?? Object.keys(properties);
  return <View style={styles.root}>{(definition.ui?.sections ?? [{ id: 'default', title: '', fields }]).map((section) => <View key={section.id} style={styles.section}>{section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}{section.fields.map((path) => { const schema = properties[path] ?? {}; const semantic = fieldSemantic(schema); const renderer = registry.get(semantic); if (!renderer) return null; const error = errors.find((item) => item.path === path); const context: FieldRenderContext = { inputRef: node => { if (node) inputsRef.current.set(path, node); else inputsRef.current.delete(path); }, disabled, path, label: String(schema.title ?? path), schema: { ...schema, 'x-workflow.semantic': semantic }, value: value[path], error: error?.message, onChange: (next) => { if (!disabled) onChange({ ...value, [path]: next }); } }; return <View ref={node => { if (node) fieldsRef.current.set(path, node); else fieldsRef.current.delete(path); }} key={path} style={disabled ? { opacity: 0.5 } : undefined}>{overrides[semantic]?.(context) ?? renderer.render(context)}</View>; })}</View>)}</View>;
}

const styles = StyleSheet.create({
  root: { gap: SPACING.lg },
  section: { backgroundColor: `${COLORS.surface}cc`, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: SPACING.lg, gap: SPACING.lg },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
});
