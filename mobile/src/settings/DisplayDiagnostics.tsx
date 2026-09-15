import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../ui/theme';

export function DisplayDiagnostics() {
  const [expanded, setExpanded] = useState(false);
  const { width, height, scale, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel="屏幕适配诊断" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.toggle}>
      <Text style={styles.title}>屏幕适配诊断 {expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded && <>
      <Text style={styles.help}>用于对比模拟器、外屏和内屏。折叠、旋转或更改系统字体后，数值会自动更新。</Text>
      <Text selectable style={styles.metrics}>{`窗口：${width.toFixed(1)} × ${height.toFixed(1)} dp\n像素密度：${scale.toFixed(2)}\n字体缩放：${fontScale.toFixed(2)}\n安全区（上/右/下/左）：${insets.top}/${insets.right}/${insets.bottom}/${insets.left} dp`}</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8, backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: 16 },
  toggle: { minHeight: 48, justifyContent: 'center' },
  title: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  help: { color: COLORS.textMuted, fontSize: 13 },
  metrics: { color: COLORS.text, fontSize: 13, lineHeight: 22 },
});
