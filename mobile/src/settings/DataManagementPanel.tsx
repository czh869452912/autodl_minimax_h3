import { stopTaskMonitor } from '../native/taskMonitor';
import { useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, Text, View } from 'react-native';
import { getDatabase } from '../storage/databaseClient';
import { createUserDatabaseBackup, listFullDatabaseBackups } from '../storage/backup';
import { scheduleMaintenance, type PendingMaintenance } from '../storage/pendingMaintenance';
import { COLORS } from '../ui/theme';
export function DataManagementPanel() {
  const [names, setNames] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [scheduled, setScheduled] = useState(false);
  const exitForMaintenance = async () => {
    try { await stopTaskMonitor(); BackHandler.exitApp(); setNotice('请关闭并重新打开应用完成操作'); }
    catch { setNotice('维护已安排，但未能停止后台任务。请重试退出以完成操作'); }
  };
  const request = (value: PendingMaintenance) => Alert.alert(value.kind === 'reset' ? '清除应用数据？' : '恢复此备份？', '此操作将替换应用内任务、媒体索引与草稿。系统相册视频保留。确认后退出应用，请重新打开完成操作。', [{ text: '取消', style: 'cancel' }, { text: '确认并退出', style: 'destructive', onPress: async () => { if (lock.current) return; lock.current = true; setBusy(true); try { await scheduleMaintenance(value); setScheduled(true); await exitForMaintenance(); } catch { lock.current = false; setBusy(false); setNotice('未能安排数据维护，请重试；原数据保留'); } } }]);
  const action = (label: string, work: () => void) => <Pressable key={label} accessibilityLabel={label} accessibilityRole="button" disabled={busy} onPress={work} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: COLORS.primaryActive }}>{label}</Text></Pressable>;
  return <View style={{ padding: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.surface }}><Text style={{ fontSize: 16, fontWeight: '800' }}>数据管理</Text><Text>备份包含本机任务和草稿索引，不包含视频文件或连接密钥。</Text>
    {action('立即备份数据库', () => { try { createUserDatabaseBackup(getDatabase()); setNames(listFullDatabaseBackups()); setNotice('数据库备份已创建'); } catch { setNotice('备份失败，原数据保留'); } })}
    {action('查看可恢复备份', () => { try { const backups = listFullDatabaseBackups(); setNames(backups); setNotice(backups.length ? '选择要恢复的备份' : '暂无完整备份'); } catch { setNotice('无法读取备份列表'); } })}
    {names.map(name => action(name, () => request({ kind: 'restore', backup: name })))}
    {action('清除应用数据', () => request({ kind: 'reset' }))}
    {scheduled ? <Pressable accessibilityRole="button" accessibilityLabel="重试退出完成数据维护" style={{ minHeight: 48 }} onPress={() => void exitForMaintenance()}><Text>重试退出完成数据维护</Text></Pressable> : null}
    {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}
  </View>;
}
