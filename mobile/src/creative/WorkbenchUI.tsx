import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, type IconName } from '../ui/icons';
import { COLORS } from '../ui/theme';

export function TextAction({ label, onPress, disabled = false, icon }: { label: string; onPress: () => void; disabled?: boolean; icon?: IconName }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [w.textAction, pressed && w.pressed, disabled && w.disabled]}>
    {icon ? <AppIcon name={icon} size={18} color={COLORS.primaryActive} /> : null}<Text style={w.actionText}>{label}</Text>
  </Pressable>;
}

export function SettingRow({ label, value, onPress, expanded, disabled = false, icon }: { label: string; value?: string; onPress: () => void; expanded?: boolean; disabled?: boolean; icon?: IconName }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={value ? `${label}，${value}` : label} accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }) }} disabled={disabled} onPress={onPress} style={({ pressed }) => [w.setting, pressed && w.pressed, disabled && w.disabled]}>
    {icon ? <AppIcon name={icon} size={21} /> : null}
    <View style={{ flex: 1, gap: 2 }}><Text style={w.settingLabel}>{label}</Text>{value ? <Text style={w.caption}>{value}</Text> : null}</View>
    <AppIcon name={expanded === undefined ? 'chevron_right' : expanded ? 'expand_less' : 'expand_more'} size={21} />
  </Pressable>;
}

export function SegmentedChoices<T extends string>({ label, options, value, onChange, disabled = false, singleRow = false }: { label: string; options: ReadonlyArray<{ id: T; label: string; icon?: IconName }>; value: T; onChange: (id: T) => void; disabled?: boolean; singleRow?: boolean }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[w.segments,singleRow && {flexWrap:'nowrap'}]}>{options.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: value === option.id, disabled }} disabled={disabled} onPress={() => onChange(option.id)} style={({ pressed }) => [w.segment,singleRow && {flexBasis:0,paddingHorizontal:4}, value === option.id && w.segmentSelected, pressed && w.pressed, disabled && w.disabled]}>
    {option.icon ? <AppIcon name={option.icon} size={19} color={value === option.id ? COLORS.primaryActive : COLORS.textMuted} /> : null}<Text style={[w.segmentText, value === option.id && w.segmentTextSelected]}>{option.label}</Text>
  </Pressable>)}</View>;
}

export function ParameterSheet({ title, description, onClose, children, fullScreen = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; fullScreen?:boolean }) {
  return <Modal transparent={!fullScreen} visible animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={fullScreen ? {flex:1,backgroundColor:COLORS.surface} : w.modal}>
      <Pressable accessibilityRole="button" accessibilityLabel={`关闭${title}`} onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={fullScreen ? ['top','bottom','left','right'] : ['bottom', 'left', 'right']} style={fullScreen ? {flex:1,backgroundColor:COLORS.surface} : w.sheet}>
        <View style={w.sheetHeader}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={w.sectionTitle}>{title}</Text>{description ? <Text style={w.caption}>{description}</Text> : null}</View><TextAction label="完成" onPress={onClose} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 20, gap: 16 }}>{children}</ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return <View style={w.sectionHeading}><Text accessibilityRole="header" style={w.sectionTitle}>{title}</Text>{detail ? <Text style={w.caption}>{detail}</Text> : null}</View>;
}

export const w = StyleSheet.create({
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  caption: { fontSize: 13, lineHeight: 20, color: COLORS.textMuted },
  textAction: { minHeight: 48, paddingHorizontal: 4, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 1 },
  actionText: { fontSize: 14, lineHeight: 21, color: COLORS.primaryActive, fontWeight: '600', flexShrink: 1 },
  setting: { minHeight: 56, flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  settingLabel: { color: COLORS.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 4, backgroundColor: COLORS.surfaceRaised, borderRadius: 14 },
  segment: { minHeight: 48, flexGrow: 1, flexBasis: 72, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 10 },
  segmentSelected: { backgroundColor: COLORS.surface },
  segmentText: { fontSize: 14, fontWeight: '500', color: COLORS.textMuted, textAlign: 'center', flexShrink: 1 },
  segmentTextSelected: { fontWeight: '700', color: COLORS.primaryActive },
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.scrim, paddingTop: 48 },
  sheet: { maxHeight: '92%', backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheetHeader: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomColor: COLORS.border, borderBottomWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.65 }, disabled: { opacity: 0.45 },
});
