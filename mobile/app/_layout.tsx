import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert, BackHandler } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { openDatabaseSync } from 'expo-sqlite';
import { isLegacyAppDatabase, resetAppDatabase } from '../src/storage/database';
import { registerBackgroundSync } from '../src/tasks/background';

const startupDatabase = openDatabaseSync('autodl-h3.db');

export default function RootLayout() {
  const [legacyDatabase, setLegacyDatabase] = useState(() => isLegacyAppDatabase(startupDatabase));
  const prompted = useRef(false);
  useEffect(() => {
    if (legacyDatabase) {
      if (prompted.current) return;
      prompted.current = true;
      Alert.alert(
        '检测到旧版本数据',
        '当前版本的数据结构已更新，继续使用前需要清除应用内旧任务、媒体和草稿数据。系统相册中的视频不会被删除。',
        [
          { text: '退出应用', style: 'cancel', onPress: () => BackHandler.exitApp() },
          { text: '清除并进入', style: 'destructive', onPress: () => { resetAppDatabase(startupDatabase); setLegacyDatabase(false); } },
        ],
        { cancelable: false },
      );
      return;
    }
    void registerBackgroundSync();
  }, [legacyDatabase]);
  return (
    <SafeAreaProvider>
      {legacyDatabase ? null : <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#020617' } }} />}
    </SafeAreaProvider>
  );
}
