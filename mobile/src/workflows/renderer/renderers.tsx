import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, SPACING } from '../../ui/theme';
import type { FieldRenderContext } from './types';

const numberFrom = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function FieldLabel({ ctx }: { ctx: FieldRenderContext }) {
  return <Text style={styles.label}>{ctx.label}</Text>;
}

function ErrorText({ message }: { message?: string }) {
  return message ? <Text style={styles.error}>{message}</Text> : null;
}

function textInputProps(ctx: FieldRenderContext) {
  const semantic = String(ctx.schema['x-workflow.semantic'] ?? ctx.schema.type);
  const multiline = semantic === 'prompt' || semantic === 'negativePrompt' || ctx.schema['x-workflow.widget'] === 'textarea';
  const keyboardType = semantic === 'integer' || semantic === 'seed' ? 'number-pad' : semantic === 'number' ? 'decimal-pad' : 'default';
  const placeholder = typeof ctx.schema.description === 'string'
    ? ctx.schema.description
    : semantic === 'prompt'
      ? '描述主体、动作、场景、镜头运动、光影与音效…'
      : semantic === 'seed'
        ? '如 123456（留空则随机）'
        : undefined;
  return {
    multiline,
    keyboardType,
    placeholder,
    placeholderTextColor: COLORS.textSubtle,
    value: ctx.value == null ? '' : String(ctx.value),
    onChangeText: ctx.onChange,
  } as const;
}

function renderText(ctx: FieldRenderContext) {
  const multiline = Boolean(textInputProps(ctx).multiline);
  return (
    <View style={styles.field}>
      <FieldLabel ctx={ctx} />
      <TextInput {...textInputProps(ctx)} style={[styles.input, multiline && styles.promptInput]} textAlignVertical={multiline ? 'top' : 'center'} />
      {multiline ? <Text style={styles.counter}>{String(ctx.value ?? '').length} 字符</Text> : null}
      <ErrorText message={ctx.error} />
    </View>
  );
}

function renderInteger(ctx: FieldRenderContext) {
  const minimum = numberFrom(ctx.schema.minimum, 0);
  const maximum = numberFrom(ctx.schema.maximum, Number.MAX_SAFE_INTEGER);
  const current = numberFrom(Number(ctx.value), minimum);
  const setValue = (next: number) => ctx.onChange(Math.max(minimum, Math.min(maximum, next)));
  return (
    <View style={styles.field}>
      <FieldLabel ctx={ctx} />
      <View style={styles.durationRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`减少${ctx.label}`} onPress={() => setValue(current - 1)} style={styles.step}><Text style={styles.stepText}>−</Text></Pressable>
        <TextInput {...textInputProps(ctx)} style={[styles.input, styles.durationInput]} keyboardType="number-pad" textAlign="center" />
        <Pressable accessibilityRole="button" accessibilityLabel={`增加${ctx.label}`} onPress={() => setValue(current + 1)} style={styles.step}><Text style={styles.stepText}>＋</Text></Pressable>
      </View>
      <Text style={styles.rangeHint}>{minimum}–{maximum} {ctx.label.includes('时长') ? '秒' : ''}</Text>
      <ErrorText message={ctx.error} />
    </View>
  );
}

function renderEnum(ctx: FieldRenderContext) {
  const values = Array.isArray(ctx.schema.enum) ? ctx.schema.enum : [];
  return (
    <View style={styles.field}>
      <FieldLabel ctx={ctx} />
      <View style={styles.chips}>{values.map((value) => { const selected = ctx.value === value; return <Pressable key={String(value)} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => ctx.onChange(value)} style={[styles.chip, selected && styles.selectedChip]}><Text style={[styles.chipText, selected && styles.selectedText]}>{String(value)}</Text></Pressable>; })}</View>
      <ErrorText message={ctx.error} />
    </View>
  );
}

function renderBoolean(ctx: FieldRenderContext) {
  const enabled = Boolean(ctx.value);
  return (
    <View style={styles.field}>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: enabled }} onPress={() => ctx.onChange(!enabled)} style={[styles.toggle, enabled && styles.toggleEnabled]}><Text style={[styles.toggleText, enabled && styles.selectedText]}>{ctx.label}</Text><Text style={styles.toggleValue}>{enabled ? '是' : '否'}</Text></Pressable>
      <ErrorText message={ctx.error} />
    </View>
  );
}

export function renderField(ctx: FieldRenderContext): React.ReactNode {
  const semantic = String(ctx.schema['x-workflow.semantic'] ?? ctx.schema.type);
  if (semantic === 'boolean') return renderBoolean(ctx);
  if (semantic === 'enum') return renderEnum(ctx);
  if (semantic === 'integer' && ctx.schema['x-workflow.widget'] === 'stepper') return renderInteger(ctx);
  return renderText(ctx);
}

const styles = StyleSheet.create({
  field: { gap: SPACING.sm },
  label: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  input: { minHeight: 44, paddingHorizontal: SPACING.md, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 14 },
  promptInput: { minHeight: 150, paddingTop: SPACING.md, paddingBottom: SPACING.md, lineHeight: 23 },
  counter: { borderTopWidth: 1, borderTopColor: COLORS.border, color: COLORS.textSubtle, fontSize: 11, paddingTop: SPACING.sm, fontFamily: 'monospace' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { minWidth: '46%', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', backgroundColor: COLORS.surfaceRaised, borderWidth: 1, borderColor: COLORS.border },
  selectedChip: { borderColor: COLORS.primaryActive, backgroundColor: COLORS.primarySoft },
  chipText: { color: COLORS.textMuted, fontSize: 13 },
  selectedText: { color: '#c7d2fe', fontWeight: '800' },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  step: { width: 42, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceRaised, borderWidth: 1, borderColor: COLORS.border },
  stepText: { color: COLORS.primaryActive, fontSize: 23 },
  durationInput: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  rangeHint: { color: COLORS.textSubtle, fontSize: 11, textAlign: 'center' },
  toggle: { minHeight: 44, paddingHorizontal: SPACING.md, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleEnabled: { borderColor: COLORS.primaryActive, backgroundColor: COLORS.primarySoft },
  toggleText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  toggleValue: { color: COLORS.textMuted, fontSize: 13 },
  error: { color: COLORS.danger, fontSize: 11 },
});
