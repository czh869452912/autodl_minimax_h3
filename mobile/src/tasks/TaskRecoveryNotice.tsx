import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { TaskCard } from './taskCard';
import { COLORS } from '../ui/theme';

export function TaskRecoveryNotice({ item, busy, onSettings, onRefresh, onReplace }: {
  item: TaskCard; busy: boolean; onSettings?(): void; onRefresh?(): void; onReplace?(id: string): void;
}) {
  const unknown = item.status === 'UNKNOWN';
  const active = item.status === 'RUNNING' || item.status === 'QUEUED';
  if (!unknown && (!active || (!item.syncError && item.syncState !== 'BLOCKED'))) return null;
  const auth = /_AUTH(?:_|$)/.test(item.syncErrorCode ?? '');
  const blocked = item.syncState === 'BLOCKED';
  const check = () => Alert.alert('核查原任务', '请在 AutoDL 任务记录中按提交时间和描述核查。这里的本地编号不是服务端任务编号。\n\n本地编号：' + item.id + '\n创建时间：' + new Date(item.createdAt).toLocaleString() + '\n描述：' + (item.prompt || '无'), [
    { text: '关闭', style: 'cancel' },
    { text: '复制核查信息', onPress: () => { void Clipboard.setStringAsync('本地编号：' + item.id + '\n创建时间：' + new Date(item.createdAt).toLocaleString() + '\n描述：' + item.prompt).then(() => Alert.alert('已复制', '可用于对照 AutoDL 任务记录。')).catch(() => Alert.alert('复制失败', '请稍后重试')); } },
    { text: '打开 AutoDL', onPress: () => { void Linking.openURL('https://autodl.art').catch(() => Alert.alert('无法打开页面', '请在浏览器访问 https://autodl.art 核查任务记录。')); } },
  ]);
  const action = (label: string, onPress: () => void, secondary = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy }} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, (busy || pressed) && styles.dim]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  return <View style={styles.notice}>
    <Text accessibilityRole="alert" style={styles.message}>{unknown ? '提交结果待确认，原任务可能仍在执行。请先核查，重新创建可能重复消耗额度。' : auth ? '无法查询进度：AutoDL 凭据无效。修复并保存后，点击刷新同步；原任务可能仍在执行。' : blocked ? '本机同步已暂停，服务端任务不一定停止。请核查原任务后刷新重试。' : item.syncState === 'PENDING' || item.syncState === 'CLAIMED' ? '暂时无法更新进度，系统将稍后重试。服务端任务可能仍在执行。' : '进度暂未更新，请刷新同步或查看详情；服务端任务可能仍在执行。'}</Text>
    <View style={styles.actions}>
      {unknown || (blocked && !auth) ? action('核查原任务', check) : null}
      {auth && onSettings ? action('修改 AutoDL 凭据', onSettings) : null}
      {!unknown && onRefresh ? action('刷新同步', onRefresh, auth) : null}
      {unknown && onReplace ? action('确认后重新创建', () => Alert.alert('确认重新创建？', '请先核查 AutoDL 任务记录。原任务可能仍在执行，新尝试可能重复消耗额度。', [{ text: '返回核查', style: 'cancel', onPress: check }, { text: '确认创建新任务', onPress: () => onReplace(item.id) }]), true) : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  notice: { marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: COLORS.surfaceRaised, gap: 8 },
  message: { color: COLORS.warning, fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: COLORS.primaryActive },
  secondary: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  buttonText: { color: COLORS.primaryActive, fontSize: 13, fontWeight: '600' },
  dim: { opacity: 0.45 },
});
