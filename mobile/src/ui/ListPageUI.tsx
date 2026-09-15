import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, type IconName } from './icons';
import { COLORS } from './theme';

export function ListAction({ label, onPress, icon, secondary = false, disabled = false }: {
  label: string; onPress: () => void; icon?: IconName; secondary?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [listUI.action, secondary && listUI.secondaryAction, pressed && listUI.pressed, disabled && listUI.disabled]}>
    {icon ? <AppIcon name={icon} size={19} color={secondary ? COLORS.primaryActive : COLORS.onPrimary} /> : null}
    <Text style={[listUI.actionText, secondary && listUI.secondaryText]}>{label}</Text>
  </Pressable>;
}

export function ListFilters<T extends string>({ label, options, value, onChange }: {
  label: string; options: ReadonlyArray<{ id: T; label: string }>; value: T; onChange: (value: T) => void;
}) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={listUI.filters}>
    {options.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label}
      accessibilityState={{ checked: value === option.id }} onPress={() => onChange(option.id)}
      style={({ pressed }) => [listUI.filter, value === option.id && listUI.filterActive, pressed && listUI.pressed]}>
      <Text style={[listUI.filterText, value === option.id && listUI.filterTextActive]}>{option.label}</Text>
    </Pressable>)}
  </View>;
}

export function ListEmptyState({ icon, title, description, loading = false, action, secondaryAction }: {
  icon: IconName; title: string; description: string; loading?: boolean;
  action?: { label: string; onPress: () => void; icon?: IconName };
  secondaryAction?: { label: string; onPress: () => void; icon?: IconName };
}) {
  return <View style={listUI.emptyCard}>
    <View style={listUI.emptyIcon}>{loading ? <ActivityIndicator accessibilityLabel={title} color={COLORS.primaryActive} /> : <AppIcon name={icon} size={30} color={COLORS.primaryActive} />}</View>
    <Text style={listUI.emptyTitle}>{title}</Text>
    <Text style={listUI.emptyDescription}>{description}</Text>
    {action ? <ListAction {...action} /> : null}
    {secondaryAction ? <ListAction {...secondaryAction} secondary /> : null}
  </View>;
}

export const listUI = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 16 },
  filter: { flexGrow: 1, maxWidth: '100%', minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  filterActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { textAlign: 'center', color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: COLORS.onPrimary },
  action: { maxWidth: '100%', minHeight: 48, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: COLORS.primary, borderWidth: 1, borderColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { color: COLORS.onPrimary, fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  secondaryAction: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  secondaryText: { color: COLORS.primaryActive },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  emptyCard: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 32, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center', gap: 12 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: COLORS.textMuted, fontSize: 13, lineHeight: 21, textAlign: 'center', marginBottom: 8 },
  footer: { color: COLORS.textSubtle, fontSize: 12, textAlign: 'center', paddingVertical: 24 },
  notice: { padding: 14, gap: 10, borderRadius: 12, backgroundColor: COLORS.dangerSoft, marginVertical: 8 },
});
