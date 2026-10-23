import { Tabs, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTabs } from '../../src/ui/AppTabs';
import { COLORS, type AppTabId } from '../../src/ui/theme';
import { Pressable, Text, View } from 'react-native';

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = ((pathname.split('/').filter(Boolean).pop() || 'create')) as AppTabId;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16, paddingHorizontal: 16 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="打开任务中心" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => router.navigate('/(tabs)/tasks')}><Text style={{ color: COLORS.primary }}>任务中心</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="打开设置" style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => router.navigate('/(tabs)/settings')}><Text style={{ color: COLORS.primary }}>设置</Text></Pressable>
      </View>
      <Tabs
        tabBar={() => <AppTabs activeId={activeId} onSelect={(id) => router.navigate(`/(tabs)/${id}`)} />}
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border },
          tabBarActiveTintColor: COLORS.primaryActive,
          tabBarInactiveTintColor: COLORS.textMuted,
        }}
      >
        <Tabs.Screen name="projects" options={{ title: '项目' }} />
        <Tabs.Screen name="assets" options={{ title: '资产' }} />
        <Tabs.Screen name="create" options={{ title: '生成' }} />
        <Tabs.Screen name="agent" options={{ title: 'Prompt 助手' }} />
        <Tabs.Screen name="tasks" options={{ title: '任务队列' }} />
        <Tabs.Screen name="gallery" options={{ title: '结果' }} />
        <Tabs.Screen name="settings" options={{ title: '设置' }} />
      </Tabs>
    </SafeAreaView>
  );
}
