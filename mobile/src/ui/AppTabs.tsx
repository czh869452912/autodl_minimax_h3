import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './icons';
import { APP_TABS, COLORS } from './theme';
import type { AppTabId } from './theme';

export function AppTabs({ activeId, onSelect }: { activeId: AppTabId; onSelect: (id: AppTabId) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {APP_TABS.map((tab) => {
        const active = tab.id === activeId;
        return <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onSelect(tab.id)} style={[styles.item, active && styles.activeItem]}>
          <AppIcon name={tab.icon} size={25} color={active ? COLORS.text : COLORS.textMuted} />
          <Text style={[styles.label, active && styles.activeLabel]}>{tab.label}</Text>
        </Pressable>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  item: { flex: 1, minHeight: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 16, marginHorizontal: 4, gap: 3 },
  activeItem: { backgroundColor: COLORS.primary, shadowColor: COLORS.primary, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5 },
  label: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  activeLabel: { color: COLORS.text, fontWeight: '800' },
});
