import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { WorkflowDefinition } from '../schema/types';
import { AppIcon } from '../../ui/icons';
import { COLORS } from '../../ui/theme';

export function WorkflowSelector({ definitions, selectedId, onSelect, disabled = false }: {
  definitions: WorkflowDefinition[]; selectedId?: string; onSelect(id: string): void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const unavailable = disabled || definitions.length === 0;
  const selected = definitions.find(definition => definition.id === selectedId);
  useEffect(() => { setOpen(false); }, [selectedId, unavailable]);
  const expanded = open && !unavailable;
  return <View style={styles.container}>
    <Text style={styles.label}>生成工作流</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="选择生成工作流"
      accessibilityValue={{ text: selected?.metadata.title ?? '请选择工作流' }}
      accessibilityState={{ expanded, disabled: unavailable }} disabled={unavailable}
      onPress={() => setOpen(value => !value)}
      style={[styles.trigger, expanded && styles.open, unavailable && styles.disabled]}>
      <Text numberOfLines={2} style={styles.title}>{selected?.metadata.title ?? (definitions.length ? '请选择工作流' : '暂无可用工作流')}</Text>
      <AppIcon name={expanded ? 'expand_less' : 'expand_more'} size={22} />
    </Pressable>
    {expanded && <ScrollView style={styles.menu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      <View accessibilityRole="radiogroup" accessibilityLabel="可用工作流">
        {definitions.map(definition => {
          const checked = selectedId === definition.id;
          return <Pressable key={definition.id} accessibilityRole="radio"
            accessibilityLabel={`选择工作流 ${definition.metadata.title}`} accessibilityState={{ checked }}
            onPress={() => { setOpen(false); if (!checked) onSelect(definition.id); }}
            style={[styles.option, checked && styles.selected]}>
            <View style={styles.optionText}>
              <Text style={styles.title}>{definition.metadata.title}</Text>
              <Text style={styles.version}>v{definition.version}</Text>
            </View>
            {checked && <Text style={styles.check} accessibilityElementsHidden importantForAccessibility="no">✓</Text>}
          </Pressable>;
        })}
      </View>
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  label: { color: COLORS.textMuted },
  trigger: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 8, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  open: { borderColor: COLORS.primaryActive },
  disabled: { opacity: 0.5 },
  title: { color: COLORS.text, flexShrink: 1, flexGrow: 1 },
  menu: { maxHeight: 240, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: COLORS.surface },
  option: { minHeight: 56, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionText: { flex: 1, gap: 4 },
  selected: { backgroundColor: COLORS.primarySoft },
  version: { color: COLORS.textMuted, fontSize: 12 },
  check: { color: COLORS.primaryActive, fontSize: 18 },
});
