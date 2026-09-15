import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './icons';
import { APP_TABS, COLORS } from './theme';
import type { AppTabId } from './theme';
import { isCompactLayout, usePageLayout } from './adaptiveLayout';

export function AppTabs({ activeId, onSelect }: { activeId: AppTabId; onSelect: (id: AppTabId) => void }) {
  const insets = useSafeAreaInsets();
  const layout = usePageLayout();
  const [barWidth, setBarWidth] = useState(0);
  const compact = isCompactLayout(barWidth || layout.width, layout.fontScale);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboardVisible) return null;
  return (
    <View onLayout={event => setBarWidth(event.nativeEvent.layout.width)} style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {APP_TABS.map((tab) => {
        const active = tab.id === activeId;
        return <Pressable key={tab.id} accessibilityLabel={tab.label} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onSelect(tab.id)} style={({ pressed }) => [styles.item, { flexBasis: Math.max(48, 30 * layout.fontScale) }, active && styles.activeItem, pressed && styles.pressed]}>
          <AppIcon name={tab.icon} size={25} color={active ? COLORS.primaryActive : COLORS.textMuted} />
          <Text style={[styles.label, active && styles.activeLabel]}>{compact ? tab.id === 'agent' ? '助手' : tab.id === 'tasks' ? '任务' : tab.label : tab.label}</Text>
        </Pressable>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  item: { flexGrow: 1, flexShrink: 1, minWidth: 48, minHeight: 66, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 8, marginHorizontal: 2, gap: 3 },
  pressed: { backgroundColor: COLORS.surfaceRaised },
  activeItem: { backgroundColor: COLORS.primarySoft },
  label: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  activeLabel: { color: COLORS.primaryActive, fontWeight: '800' },
});
