import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING } from './theme';

export function AppHeader() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回生成页" onPress={() => router.replace('/(tabs)/create')} style={styles.brand}>
        <View style={styles.logo}><View style={styles.logoMark} /></View>
        <Text style={styles.title}>AutoDL <Text style={styles.accent}>H3</Text></Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 76, backgroundColor: `${COLORS.surface}ee`, borderBottomWidth: 1, borderBottomColor: COLORS.border, justifyContent: 'center', paddingHorizontal: SPACING.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  logo: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  logoMark: { width: 18, height: 18, backgroundColor: COLORS.text, borderRadius: 5, transform: [{ rotate: '45deg' }] },
  title: { color: COLORS.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  accent: { color: COLORS.primaryActive },
});
