import { useState } from 'react';
import { StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../ui/theme';

export function DisplayDiagnostics() {
  const [enabled, setEnabled] = useState(false);
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>诊断</Text>
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>显示诊断信息</Text>
      <Switch accessibilityLabel="显示诊断信息" value={enabled} onValueChange={setEnabled}
        trackColor={{ false: COLORS.border, true: COLORS.primaryActive }} thumbColor={COLORS.text} />
    </View>
    <Text style={styles.help}>手动开启后查看当前屏幕信息，便于排查显示与布局问题。</Text>
    {enabled && <DisplayMetrics />}
  </View>;
}

function DisplayMetrics() {
  const { width, height, scale, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return <View style={styles.details}>
      <Text style={styles.title}>屏幕信息</Text>
      <Text style={styles.help}>用于对比模拟器、外屏和内屏。折叠、旋转或更改系统字体后，数值会自动更新。</Text>
      <Text selectable style={styles.metrics}>{`窗口：${width.toFixed(1)} × ${height.toFixed(1)} dp\n像素密度：${scale.toFixed(2)}\n字体缩放：${fontScale.toFixed(2)}\n安全区（上/右/下/左）：${insets.top}/${insets.right}/${insets.bottom}/${insets.left} dp`}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8, backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: 16 },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleLabel: { flex: 1, color: COLORS.text, fontSize: 14 },
  details: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  title: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  help: { color: COLORS.textMuted, fontSize: 13 },
  metrics: { color: COLORS.text, fontSize: 13, lineHeight: 22 },
});
