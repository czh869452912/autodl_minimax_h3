import { Tabs, usePathname, useRouter } from 'expo-router';
import { AppHeader } from '../../src/ui/AppHeader';
import { AppTabs } from '../../src/ui/AppTabs';
import type { AppTabId } from '../../src/ui/theme';

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = (pathname.match(/\/\(tabs\)\/([^/]+)/)?.[1] || 'create') as AppTabId;
  return (
    <>
      <AppHeader />
      <Tabs
      tabBar={() => <AppTabs activeId={activeId} onSelect={(id) => router.navigate(`/(tabs)/${id}`)} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0f172a', borderTopColor: '#1e293b' },
        tabBarActiveTintColor: '#818cf8',
      tabBarInactiveTintColor: '#94a3b8',
      }}
    >
      <Tabs.Screen name="create" options={{ title: '生成' }} />
      <Tabs.Screen name="agent" options={{ title: 'Prompt 助手' }} />
      <Tabs.Screen name="tasks" options={{ title: '任务队列' }} />
      <Tabs.Screen name="gallery" options={{ title: '结果' }} />
      <Tabs.Screen name="settings" options={{ title: '设置' }} />
      </Tabs>
    </>
  );
}
