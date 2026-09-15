import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, SPACING } from '../../ui/theme';
import type { FieldRenderContext } from './types';

const numberFrom = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function FieldLabel({ ctx }: { ctx: FieldRenderContext }) {
  return <Text style={styles.label}>{ctx.label}</Text>;
}

function ErrorText({ message }: { message?: string }) {
  return message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null;
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
    ref: ctx.inputRef,
    accessibilityHint: ctx.error,
    editable: !ctx.disabled,
    accessibilityState: { disabled: Boolean(ctx.disabled) },
    multiline,
    keyboardType,
    placeholder,
    placeholderTextColor: COLORS.textSubtle,
    accessibilityLabel: ctx.label,
    value: ctx.value == null ? '' : String(ctx.value),
    onChangeText: ctx.onChange,
  } as const;
}

function renderText(ctx: FieldRenderContext) {
  const multiline = Boolean(textInputProps(ctx).multiline);
  const length = String(ctx.value ?? '').length;
  const maximum = typeof ctx.schema.maxLength === 'number' ? ctx.schema.maxLength : undefined;
  const counter = maximum === undefined
    ? `${length.toLocaleString()} 字符`
    : `${length.toLocaleString()} / ${maximum.toLocaleString()} 字符`;
  return (
    <View style={styles.field}>
      <FieldLabel ctx={ctx} />
      <TextInput {...textInputProps(ctx)} style={[styles.input, multiline && styles.promptInput]} textAlignVertical={multiline ? 'top' : 'center'} />
      {multiline ? <Text style={[styles.counter, ctx.error && styles.counterError]}>{counter}</Text> : null}
      <ErrorText message={ctx.error} />
    </View>
  );
}

function renderInteger(ctx: FieldRenderContext) {
  const minimum = numberFrom(ctx.schema.minimum, 0);
  const maximum = numberFrom(ctx.schema.maximum, Number.MAX_SAFE_INTEGER);
  const current = String(ctx.value ?? '').trim() ? numberFrom(Number(ctx.value), minimum) : minimum;
  const setValue = (next: number) => ctx.onChange(Math.max(minimum, Math.min(maximum, next)));
  return (
    <View style={styles.field}>
      <FieldLabel ctx={ctx} />
      <View style={styles.durationRow}>
        <Pressable disabled={ctx.disabled} accessibilityRole="button" accessibilityLabel={`减少${ctx.label}`} onPress={() => setValue(current - 1)} style={styles.step}><Text style={styles.stepText}>−</Text></Pressable>
        <TextInput {...textInputProps(ctx)} style={[styles.input, styles.durationInput]} keyboardType="number-pad" textAlign="center" />
        <Pressable disabled={ctx.disabled} accessibilityRole="button" accessibilityLabel={`增加${ctx.label}`} onPress={() => setValue(current + 1)} style={styles.step}><Text style={styles.stepText}>＋</Text></Pressable>
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
      <View accessibilityRole="radiogroup" accessibilityLabel={ctx.label} style={styles.chips}>{values.map((value) => { const selected = ctx.value === value; return <Pressable key={String(value)} disabled={ctx.disabled} accessibilityRole="radio" accessibilityState={{ selected, disabled: Boolean(ctx.disabled) }} onPress={() => ctx.onChange(value)} style={[styles.chip, selected && styles.selectedChip]}><Text style={[styles.chipText, selected && styles.selectedText]}>{String(value)}</Text></Pressable>; })}</View>
      <ErrorText message={ctx.error} />
    </View>
  );
}

function renderBoolean(ctx: FieldRenderContext) {
  const enabled = Boolean(ctx.value);
  return (
    <View style={styles.field}>
      <Pressable disabled={ctx.disabled} accessibilityRole="switch" accessibilityState={{ checked: enabled, disabled: Boolean(ctx.disabled) }} onPress={() => ctx.onChange(!enabled)} style={[styles.toggle, enabled && styles.toggleEnabled]}><Text style={[styles.toggleText, enabled && styles.selectedText]}>{ctx.label}</Text><Text style={styles.toggleValue}>{enabled ? '是' : '否'}</Text></Pressable>
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
  label: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0 },
  input: { minHeight: 48, paddingHorizontal: SPACING.md, borderRadius: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.controlBorder, color: COLORS.text, fontSize: 14 },
  promptInput: { minHeight: 150, paddingTop: SPACING.md, paddingBottom: SPACING.md, lineHeight: 23 },
  counter: { borderTopWidth: 1, borderTopColor: COLORS.border, color: COLORS.textSubtle, fontSize: 13, paddingTop: SPACING.sm, fontFamily: 'monospace' },
  counterError: { color: COLORS.danger, borderTopColor: COLORS.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { minWidth: '46%', minHeight: 48, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceRaised, borderWidth: 1, borderColor: COLORS.controlBorder },
  selectedChip: { borderColor: COLORS.primaryActive, backgroundColor: COLORS.primarySoft },
  chipText: { color: COLORS.textMuted, fontSize: 13 },
  selectedText: { color: COLORS.primaryActive, fontWeight: '800' },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  step: { width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceRaised, borderWidth: 1, borderColor: COLORS.controlBorder },
  stepText: { color: COLORS.primaryActive, fontSize: 23 },
  durationInput: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  rangeHint: { color: COLORS.textSubtle, fontSize: 13, textAlign: 'center' },
  toggle: { minHeight: 48, paddingHorizontal: SPACING.md, borderRadius: 8, borderWidth: 1, borderColor: COLORS.controlBorder, backgroundColor: COLORS.surfaceRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleEnabled: { borderColor: COLORS.primaryActive, backgroundColor: COLORS.primarySoft },
  toggleText: { flex: 1, flexShrink: 1, color: COLORS.text, fontSize: 14, fontWeight: '700' },
  toggleValue: { color: COLORS.textMuted, fontSize: 13 },
  error: { color: COLORS.danger, fontSize: 13 },
});
