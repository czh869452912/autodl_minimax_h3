import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { registerBackgroundSync } from '../src/tasks/background';

export default function RootLayout() {
  useEffect(() => { void registerBackgroundSync(); }, []);
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#020617' } }} />
    </SafeAreaProvider>
  );
}
