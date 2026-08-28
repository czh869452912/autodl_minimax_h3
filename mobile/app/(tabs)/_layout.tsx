import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
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
  );
}
