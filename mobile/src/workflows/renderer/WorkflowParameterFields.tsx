import { Pressable, Text, TextInput, View } from 'react-native';
import type { WorkflowDefinition } from '../schema/types';
import { inputField, inputProperties } from '../inputModel';
import { LIGHT_PROMPT_COLORS as colors } from '../../ui/theme';

/** The supported H3 provider vocabulary; controls and constraints come from the package. */
export function WorkflowParameterFields({ definition, values, onChange, disabled }: {
  definition: WorkflowDefinition; values: Record<string, unknown>; onChange(target: string, value: unknown): void; disabled?: boolean;
}) {
  const properties = inputProperties(definition);
  const labels: Record<string, string> = { resolution: '分辨率（可选）', duration: '时长秒数（可选）', seed: 'Seed（可选）' };
  return <View style={{ gap: 12 }}>{['resolution', 'duration', 'seed'].map(target => {
    const schema = properties[inputField(definition, target)];
    if (!schema) return null;
    return <View key={target} style={{ gap: 8 }}>
      <Text style={{ color: colors.ink }}>{schema.title ?? labels[target]}</Text>
      <TextInput accessibilityLabel={labels[target]} editable={!disabled}
        keyboardType={schema.type === 'integer' || schema.type === 'number' ? 'number-pad' : 'default'}
        placeholder={`工作流默认${schema.default === undefined ? '' : `：${schema.default}`}`}
        placeholderTextColor={colors.placeholder} value={String(values[target] ?? '')}
        onChangeText={text => onChange(target, text)}
        style={{ minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, color: colors.ink }} />
      {Array.isArray(schema.enum) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{schema.enum.map((value: unknown) =>
        <Pressable key={String(value)} accessibilityRole="button" accessibilityLabel={String(value)} disabled={disabled}
          onPress={() => onChange(target, value)} style={{ padding: 12, minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 8 }}>
          <Text style={{ color: colors.ink }}>{String(value)}</Text>
        </Pressable>)}</View>}
      {(schema.minimum !== undefined || schema.maximum !== undefined) && <Text style={{ color: colors.muted }}>{schema.minimum ?? '不限'}–{schema.maximum ?? '不限'}</Text>}
      {target === 'seed' && <Pressable accessibilityRole="button" accessibilityLabel="使用随机种子" disabled={disabled} onPress={() => onChange(target, '')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.ink }}>使用随机值</Text></Pressable>}
    </View>;
  })}</View>;
}
