import { stopTaskMonitor } from '../native/taskMonitor';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, Text, View } from 'react-native';
import { getDatabase } from '../storage/databaseClient';
import { createUserDatabaseBackup, listFullDatabaseBackups } from '../storage/backup';
import { scheduleMaintenance, type PendingMaintenance } from '../storage/pendingMaintenance';
import { COLORS } from '../ui/theme';
import { createId } from '../ids';
export function DataManagementPanel() {
  useEffect(()=>{let live=true;void import('../storage/resourceCleanupRuntime').then(m=>m.lastResourceCleanup()).then(result=>{if(live&&result)setNotice(`上次清理 ${result.deleted} 个文件，释放 ${(result.bytes/1024/1024).toFixed(1)} MB${result.failed?`，${result.failed} 项失败，可重新扫描重试`:''}`);}).catch(()=>undefined);return()=>{live=false;};},[]);
  const [cleanup,setCleanup]=useState<{count:number;bytes:number}>();
  const [names, setNames] = useState<string[]>([]);
  const [fileBackups, setFileBackups] = useState<Array<{ id: string; createdAt: number; fileCount: number }>>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [scheduled, setScheduled] = useState(false);
  const exitForMaintenance = async () => {
    try { await stopTaskMonitor(); BackHandler.exitApp(); setNotice('请关闭并重新打开应用完成操作'); }
    catch { setNotice('维护已安排，但未能停止后台任务。请重试退出以完成操作'); }
  };
  const request = (value: PendingMaintenance) => Alert.alert(value.kind === 'resource-cleanup' ? '清理可再生与孤儿文件？' : value.kind === 'creative-backup' ? '创建含文件的备份？' : value.kind === 'reset' ? '清除应用数据？' : '恢复此备份？', value.kind === 'resource-cleanup' ? '下次启动时重新检查并清理超过一天的预览缓存、无任务关联的回执内容及孤儿文件。保留素材原件、回收站、备份和发送标记。确认后退出，再打开应用完成清理。' : value.kind === 'creative-backup' ? '备份数据库与应用私有目录中的文件，不含账号密钥、系统相册或云端文件。需要额外存储空间。确认后退出，再打开应用完成备份。' : '此操作将替换应用内任务、媒体索引与草稿。系统相册视频保留。恢复的任务不会自动重新执行。确认后退出应用，请重新打开完成操作。', [{ text: '取消', style: 'cancel' }, { text: '确认并退出', style: value.kind === 'creative-backup' ? 'default' : 'destructive', onPress: async () => { if (lock.current) return; lock.current = true; setBusy(true); try { await scheduleMaintenance(value); setScheduled(true); await exitForMaintenance(); } catch { lock.current = false; setBusy(false); setNotice('未能安排数据维护，请重试；原数据保留'); } } }]);
  const action = (label: string, work: () => void) => <Pressable key={label} accessibilityLabel={label} accessibilityRole="button" disabled={busy} onPress={work} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: COLORS.primaryActive }}>{label}</Text></Pressable>;
  return <View style={{ padding: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.surface }}><Text style={{ fontSize: 16, fontWeight: '800' }}>数据管理</Text><Text>数据库备份保存记录；含文件备份同时保存创作原件。连接密钥不包含在备份中。</Text>
    {action('扫描可清理空间',()=>{void import('../storage/resourceCleanupRuntime').then(m=>m.inspectResourceCleanup(getDatabase())).then(setCleanup).catch(()=>setNotice('扫描失败，未删除任何文件'));})}
    {cleanup?<><Text>{cleanup.count} 个文件 · 约 {(cleanup.bytes/1024/1024).toFixed(1)} MB 可清理</Text>{cleanup.count?action('清理并重新启动',()=>request({kind:'resource-cleanup'})):null}</>:null}
    {action('立即备份数据库', () => { try { createUserDatabaseBackup(getDatabase()); setNames(listFullDatabaseBackups()); setNotice('数据库备份已创建'); } catch { setNotice('备份失败，原数据保留'); } })}
    {action('查看可恢复备份', () => { try { const backups = listFullDatabaseBackups(); setNames(backups); setNotice(backups.length ? '选择要恢复的备份' : '暂无完整备份'); } catch { setNotice('无法读取备份列表'); } })}
    {names.map(name => action(name, () => request({ kind: 'restore', backup: name })))}
    {action('备份数据库与创作文件', () => request({ kind: 'creative-backup', id: createId() }))}
    {action('查看含文件的备份', () => { void import('../storage/creativeBackupRuntime').then(m => m.listCreativeFileBackups()).then(items => { setFileBackups(items); setNotice(items.length ? '仅支持当前安装目录恢复；冲突文件会阻止恢复并保留现有数据' : '暂无含文件的备份'); }).catch(() => setNotice('读取备份失败')); })}
    {fileBackups.map(item => action(`${new Date(item.createdAt).toLocaleString()} · ${item.fileCount} 个文件`, () => request({ kind: 'creative-restore', id: item.id })))}
    {action('清除应用数据', () => request({ kind: 'reset' }))}
    {scheduled ? <Pressable accessibilityRole="button" accessibilityLabel="重试退出完成数据维护" style={{ minHeight: 48 }} onPress={() => void exitForMaintenance()}><Text>重试退出完成数据维护</Text></Pressable> : null}
    {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}
  </View>;
}
