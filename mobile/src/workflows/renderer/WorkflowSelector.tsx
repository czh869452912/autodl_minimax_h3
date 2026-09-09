import { Pressable, Text, View } from 'react-native';
import type { WorkflowDefinition } from '../schema/types';
import { COLORS } from '../../ui/theme';

export function WorkflowSelector({ definitions, selectedId, onSelect, disabled = false }: {
  definitions: WorkflowDefinition[]; selectedId?: string; onSelect(id: string): void; disabled?: boolean;
}) {
  return <View accessibilityRole="radiogroup" accessibilityLabel="选择生成工作流" style={{ gap: 8 }}>
    <Text style={{ color: COLORS.textMuted }}>生成工作流</Text>
    {definitions.map(definition => <Pressable key={definition.id} accessibilityRole="radio"
      accessibilityLabel={`选择工作流 ${definition.metadata.title}`} accessibilityState={{ checked: selectedId === definition.id, disabled }}
      disabled={disabled} onPress={() => onSelect(definition.id)}
      style={{ minHeight: 48, padding: 12, borderWidth: 1, borderRadius: 8, borderColor: selectedId === definition.id ? COLORS.primaryActive : COLORS.border }}>
      <Text style={{ color: COLORS.text }}>{definition.metadata.title} · {definition.version}</Text>
    </Pressable>)}
  </View>;
}
