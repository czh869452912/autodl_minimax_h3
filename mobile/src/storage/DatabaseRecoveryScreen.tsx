import { ActivityIndicator, Alert, BackHandler, Pressable, Share, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { COLORS } from '../ui/theme';
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
  const [selectedBackup, setSelectedBackup] = useState(backupNames[0]);
  const newestBackup = selectedBackup;
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
      `将恢复 ${newestBackup}，当前数据库会被完整替换，恢复完成后应用将退出，请重新打开应用。`,
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
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.title}>数据升级未完成</Text>
      <Text style={styles.body}>应用已进入只读恢复模式，后台任务和数据写入均已停止。</Text>
      <Text selectable style={styles.code}>{diagnostic}</Text>
      {restoring ? <ActivityIndicator accessibilityLabel="正在恢复备份" /> : null}
      {restoreError ? <Text style={styles.error}>{restoreError}</Text> : null}
      <Pressable disabled={restoring} accessibilityRole="button" accessibilityLabel="复制诊断" style={styles.button} onPress={() => Clipboard.setStringAsync(diagnostic)}>
        <Text style={styles.buttonText}>复制诊断</Text>
      </Pressable>
      <Pressable disabled={restoring} accessibilityRole="button" accessibilityLabel="分享诊断" style={styles.button} onPress={() => Share.share({ message: `AutoDL-H3 database recovery: ${diagnostic}` })}>
        <Text style={styles.buttonText}>分享诊断</Text>
      </Pressable>
      {allowReset ? (
        <>
          <View accessibilityRole="radiogroup" accessibilityLabel="完整备份">{backupNames.map(name => <Pressable key={name} accessibilityRole="radio" accessibilityState={{ checked: newestBackup === name, disabled: restoring }} disabled={restoring} onPress={() => setSelectedBackup(name)} style={styles.button}><Text style={styles.buttonText}>{newestBackup === name ? '✓ ' : ''}{name}</Text></Pressable>)}</View>
          {newestBackup && onRestore ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="恢复选中的完整备份"
              disabled={restoring}
              style={styles.button}
              onPress={confirmRestore}
            >
              <Text style={styles.buttonText}>{restoring ? '正在恢复…' : '恢复选中的完整备份'}</Text>
            </Pressable>
          ) : null}
          <Pressable disabled={restoring} accessibilityRole="button" accessibilityLabel="清除应用数据" style={styles.danger} onPress={confirmReset}>
            <Text style={styles.buttonText}>清除应用数据</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable disabled={restoring} accessibilityRole="button" accessibilityLabel="退出应用" style={styles.button} onPress={() => BackHandler.exitApp()}>
        <Text style={styles.buttonText}>退出应用</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14, backgroundColor: COLORS.background },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '700' },
  body: { color: COLORS.textMuted, fontSize: 15, lineHeight: 22 },
  code: { color: COLORS.warning, fontFamily: 'monospace' },
  error: { color: COLORS.danger, fontSize: 14, lineHeight: 20 },
  button: { padding: 14, borderRadius: 10, backgroundColor: COLORS.surfaceRaised },
  danger: { padding: 14, borderRadius: 10, backgroundColor: COLORS.dangerSoft },
  buttonText: { color: COLORS.text, textAlign: 'center', fontWeight: '600' },
});
