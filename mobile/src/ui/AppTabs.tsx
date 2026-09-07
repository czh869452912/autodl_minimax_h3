import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './icons';
import { APP_TABS, COLORS } from './theme';
import type { AppTabId } from './theme';

export function AppTabs({ activeId, onSelect }: { activeId: AppTabId; onSelect: (id: AppTabId) => void }) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboardVisible) return null;
  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {APP_TABS.map((tab) => {
        const active = tab.id === activeId;
        return <Pressable key={tab.id} accessibilityLabel={tab.label} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onSelect(tab.id)} style={({ pressed }) => [styles.item, active && styles.activeItem, pressed && styles.pressed]}>
          <AppIcon name={tab.icon} size={25} color={active ? COLORS.primaryActive : COLORS.textMuted} />
          <Text style={[styles.label, active && styles.activeLabel]}>{tab.label}</Text>
        </Pressable>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  item: { flex: 1, minWidth: 0, minHeight: 66, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 8, marginHorizontal: 2, gap: 3 },
  pressed: { backgroundColor: COLORS.surfaceRaised },
  activeItem: { backgroundColor: COLORS.primarySoft },
  label: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  activeLabel: { color: COLORS.primaryActive, fontWeight: '800' },
});
