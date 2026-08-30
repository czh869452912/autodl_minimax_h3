import { Pressable, Text, TextInput, View } from 'react-native';
import type { FieldRenderContext } from './types';

export function renderField(ctx: FieldRenderContext): React.ReactNode {
  const semantic = String(ctx.schema['x-workflow.semantic'] ?? ctx.schema.type);
  if (semantic === 'boolean') return <Pressable accessibilityRole="switch" onPress={() => ctx.onChange(!ctx.value)}><Text>{ctx.label}: {ctx.value ? '是' : '否'}</Text></Pressable>;
  if (semantic === 'enum') return <View><Text>{ctx.label}</Text><View>{(Array.isArray(ctx.schema.enum) ? ctx.schema.enum : []).map((value) => <Pressable key={String(value)} onPress={() => ctx.onChange(value)}><Text>{ctx.value === value ? '● ' : '○ '}{String(value)}</Text></Pressable>)}</View></View>;
  const multiline = semantic === 'prompt' || semantic === 'negativePrompt' || ctx.schema['x-workflow.widget'] === 'textarea';
  return <View><Text>{ctx.label}</Text><TextInput multiline={multiline} value={ctx.value == null ? '' : String(ctx.value)} onChangeText={ctx.onChange} /><>{ctx.error ? <Text>{ctx.error}</Text> : null}</></View>;
}
