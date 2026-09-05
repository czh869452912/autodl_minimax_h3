import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert, AppState, BackHandler } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { getDatabase, getDatabaseStartupState, type DatabaseStartupState } from '../src/storage/databaseClient';
import { isLegacyAppDatabase, resetAppDatabase } from '../src/storage/database';
import { DatabaseRecoveryScreen } from '../src/storage/DatabaseRecoveryScreen';
import { registerBackgroundSync } from '../src/tasks/background';
import { startForegroundTaskExecution } from '../src/tasks/foregroundRuntime';
import { resumeTaskSyncAfterReconnect } from '../src/tasks/background';
import * as Network from 'expo-network';
import { createConnectivityEdgeDetector } from '../src/tasks/networkRecovery';
import { listFullDatabaseBackups, restoreFullDatabaseBackup } from '../src/storage/backup';

export default function RootLayout() {
  const [startupDatabase] = useState(() => getDatabase());
  const [startupState, setStartupState] = useState<DatabaseStartupState>(() => {
    const state = getDatabaseStartupState();
    if (state.mode === 'writable' && isLegacyAppDatabase(startupDatabase)) return { mode: 'legacy' };
    return state;
  });
  const prompted = useRef(false);
  const connectivity = useRef(createConnectivityEdgeDetector());
  useEffect(() => {
    if (startupState.mode === 'readonly') return;
    if (startupState.mode === 'legacy') {
      if (prompted.current) return;
      prompted.current = true;
      Alert.alert(
        '检测到旧版本数据',
        '当前版本的数据结构已更新，继续使用前需要清除应用内旧任务、媒体和草稿数据。系统相册中的视频不会被删除。',
        [
          { text: '退出应用', style: 'cancel', onPress: () => BackHandler.exitApp() },
          { text: '清除并进入', style: 'destructive', onPress: () => { resetAppDatabase(startupDatabase); setStartupState({ mode: 'writable' }); } },
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
  }, [startupState]);
  if (startupState.mode === 'readonly') {
    let backupNames: string[] = [];
    if (startupState.allowReset) {
      try { backupNames = listFullDatabaseBackups(); } catch { backupNames = []; }
    }
    return (
      <SafeAreaProvider>
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
      {startupState.mode === 'legacy' ? null : <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#020617' } }} />}
    </SafeAreaProvider>
  );
}
