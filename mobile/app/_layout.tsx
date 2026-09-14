import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert, AppState, BackHandler, StatusBar } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { getDatabase, getDatabaseStartupState, type DatabaseStartupState } from '../src/storage/databaseClient';
import { isLegacyAppDatabase, resetAppDatabase } from '../src/storage/database';
import { DatabaseRecoveryScreen } from '../src/storage/DatabaseRecoveryScreen';
import { registerBackgroundSync } from '../src/tasks/background';
import { startForegroundTaskExecution } from '../src/tasks/foregroundRuntime';
import { resumeTaskSyncAfterReconnect } from '../src/tasks/background';
import * as Network from 'expo-network';
import { createConnectivityEdgeDetector } from '../src/tasks/networkRecovery';
import { COLORS } from '../src/ui/theme';
import { InvalidMaintenanceRequestError, readPendingMaintenance, scheduleMaintenance } from '../src/storage/pendingMaintenance';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { listFullDatabaseBackups, restoreFullDatabaseBackup, createUserDatabaseBackup } from '../src/storage/backup';

export default function RootLayout() {
  const [startupDatabase] = useState(() => getDatabase());
  const [startupState, setStartupState] = useState<DatabaseStartupState>(() => {
    const state = getDatabaseStartupState();
    if (state.mode === 'writable' && isLegacyAppDatabase(startupDatabase)) return { mode: 'legacy' };
    return state;
  });
  const [maintenanceReady, setMaintenanceReady] = useState(false);
  const [invalidMaintenance, setInvalidMaintenance] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState('');
  const [maintenanceAttempt, setMaintenanceAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const request = await readPendingMaintenance();
      if (request) {
        if (request.kind === 'restore') restoreFullDatabaseBackup(startupDatabase, request.backup);
        else { createUserDatabaseBackup(startupDatabase); resetAppDatabase(startupDatabase); }
        await scheduleMaintenance();
        getDatabase(); // Reopen and migrate the restored schema before mounting writers.
        if (active) setStartupState(getDatabaseStartupState());
      }
      if (active) setMaintenanceReady(true);
    })().catch(reason => { if (active) { setInvalidMaintenance(reason instanceof InvalidMaintenanceRequestError); setMaintenanceError('数据维护未完成，原备份仍保留。请重试或退出。'); } });
    return () => { active = false; };
  }, [startupDatabase, maintenanceAttempt]);
  const prompted = useRef(false);
  const connectivity = useRef(createConnectivityEdgeDetector());
  useEffect(() => {
    if (!maintenanceReady || startupState.mode === 'readonly') return;
    if (startupState.mode === 'legacy') {
      if (prompted.current) return;
      prompted.current = true;
      Alert.alert(
        '检测到旧版本数据',
        '当前版本的数据结构已更新，继续使用前需要清除应用内旧任务、媒体和草稿数据。系统相册中的视频不会被删除。',
        [
          { text: '退出应用', style: 'cancel', onPress: () => BackHandler.exitApp() },
          { text: '清除并进入', style: 'destructive', onPress: () => Alert.alert(
            '确认永久清除旧数据？',
            '将永久删除应用内旧任务、媒体索引和草稿，无法撤销。系统相册中的视频会保留；如需保留旧数据，请退出应用。',
            [
              { text: '退出应用', style: 'cancel', onPress: () => BackHandler.exitApp() },
              { text: '先备份再清除', onPress: () => { try { createUserDatabaseBackup(startupDatabase); resetAppDatabase(startupDatabase); setStartupState({ mode: 'writable' }); } catch { Alert.alert('备份或清除失败', '未能完成操作，请退出后重试。'); } } },
              { text: '确认清除', style: 'destructive', onPress: () => {
                try { resetAppDatabase(startupDatabase); setStartupState({ mode: 'writable' }); }
                catch { Alert.alert('清除失败', '旧数据尚未完成清除，请重新打开应用后重试。'); }
              } },
            ],
            { cancelable: false },
          ) },
        ],
        { cancelable: false },
      );
      return;
    }
    void registerBackgroundSync();
    let foreground = startForegroundTaskExecution();
    const subscription = AppState.addEventListener('change', (state) => {
      foreground.stop();
      if (state === 'active') foreground = startForegroundTaskExecution();
    });
    const networkSubscription = Network.addNetworkStateListener((state) => {
      const reachable = state.isInternetReachable ?? state.isConnected;
      if (connectivity.current.observe(reachable)) void resumeTaskSyncAfterReconnect();
    });
    return () => { foreground.stop(); subscription.remove(); networkSubscription.remove(); };
  }, [startupState, maintenanceReady]);
  if (!maintenanceReady) return <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: COLORS.background }}>{maintenanceError ? <><Text accessibilityRole="alert">{maintenanceError}</Text><Pressable accessibilityRole="button" style={{ minHeight: 48 }} onPress={() => { setMaintenanceError(''); setMaintenanceAttempt(value => value + 1); }}><Text>重试数据维护</Text></Pressable>{invalidMaintenance ? <Pressable accessibilityRole="button" accessibilityLabel="丢弃损坏的维护请求" style={{ minHeight: 48 }} onPress={() => { void scheduleMaintenance().then(() => { setInvalidMaintenance(false); setMaintenanceError(''); setMaintenanceAttempt(value => value + 1); }).catch(() => setMaintenanceError('无法丢弃维护请求，请重试；应用数据未清除。')); }}><Text>丢弃损坏的维护请求（保留应用数据）</Text></Pressable> : null}<Pressable accessibilityRole="button" style={{ minHeight: 48 }} onPress={() => BackHandler.exitApp()}><Text>退出应用</Text></Pressable></> : <ActivityIndicator accessibilityLabel="正在准备数据" />}</View>;
  if (startupState.mode === 'readonly') {
    let backupNames: string[] = [];
    if (startupState.allowReset) {
      try { backupNames = listFullDatabaseBackups(); } catch { backupNames = []; }
    }
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <DatabaseRecoveryScreen
          diagnostic={startupState.diagnostic}
          allowReset={startupState.allowReset}
          onReset={() => { resetAppDatabase(startupDatabase); setStartupState({ mode: 'writable' }); }}
          backupNames={backupNames}
          onRestore={async (backupName) => {
            restoreFullDatabaseBackup(startupDatabase, backupName);
            BackHandler.exitApp();
          }}
        />
      </SafeAreaProvider>
    );
  }
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      {startupState.mode === 'legacy' ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>AutoDL H3</Text><Text>请先处理旧版本数据</Text></View> : <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }} />}
    </SafeAreaProvider>
  );
}
