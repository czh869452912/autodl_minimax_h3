import { Alert, BackHandler, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

type Props = {
  diagnostic: string;
  allowReset: boolean;
  onReset(): void;
  backupNames?: string[];
  onRestore?(backupName: string): Promise<void>;
};

export function DatabaseRecoveryScreen({ diagnostic, allowReset, onReset, backupNames = [], onRestore }: Props) {
  const [restoreError, setRestoreError] = useState<string>();
  const [restoring, setRestoring] = useState(false);
  const newestBackup = backupNames[0];
  const confirmReset = () => Alert.alert(
    '清除应用数据？',
    '这会删除应用内任务、媒体索引和草稿；系统相册中的文件不会被删除。',
    [
      { text: '取消', style: 'cancel' },
      { text: '确认清除', style: 'destructive', onPress: onReset },
    ],
  );
  const confirmRestore = () => {
    if (!newestBackup || !onRestore || restoring) return;
    Alert.alert(
      '恢复完整数据库备份？',
      `将恢复 ${newestBackup}，当前数据库会被完整替换，随后应用将重新载入。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认恢复',
          onPress: async () => {
            setRestoring(true);
            setRestoreError(undefined);
            try {
              await onRestore(newestBackup);
            } catch {
              setRestoreError('完整备份恢复失败，请保留诊断并联系支持。');
            } finally {
              setRestoring(false);
            }
          },
        },
      ],
    );
  };
  return (
    <View style={styles.root}>
      <Text style={styles.title}>数据升级未完成</Text>
      <Text style={styles.body}>应用已进入只读恢复模式，后台任务和数据写入均已停止。</Text>
      <Text selectable style={styles.code}>{diagnostic}</Text>
      {restoreError ? <Text style={styles.error}>{restoreError}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="复制诊断" style={styles.button} onPress={() => Clipboard.setStringAsync(diagnostic)}>
        <Text style={styles.buttonText}>复制诊断</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="分享诊断" style={styles.button} onPress={() => Share.share({ message: `AutoDL-H3 database recovery: ${diagnostic}` })}>
        <Text style={styles.buttonText}>分享诊断</Text>
      </Pressable>
      {allowReset ? (
        <>
          {newestBackup && onRestore ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="恢复最新完整备份"
              disabled={restoring}
              style={styles.button}
              onPress={confirmRestore}
            >
              <Text style={styles.buttonText}>{restoring ? '正在恢复…' : '恢复最新完整备份'}</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="清除应用数据" style={styles.danger} onPress={confirmReset}>
            <Text style={styles.buttonText}>清除应用数据</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="退出应用" style={styles.button} onPress={() => BackHandler.exitApp()}>
        <Text style={styles.buttonText}>退出应用</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 24, gap: 14, backgroundColor: '#020617' },
  title: { color: '#f8fafc', fontSize: 24, fontWeight: '700' },
  body: { color: '#cbd5e1', fontSize: 15, lineHeight: 22 },
  code: { color: '#fbbf24', fontFamily: 'monospace' },
  error: { color: '#fca5a5', fontSize: 14, lineHeight: 20 },
  button: { padding: 14, borderRadius: 10, backgroundColor: '#1e293b' },
  danger: { padding: 14, borderRadius: 10, backgroundColor: '#991b1b' },
  buttonText: { color: '#f8fafc', textAlign: 'center', fontWeight: '600' },
});
