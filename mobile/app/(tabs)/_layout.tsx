import { Tabs, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTabs } from '../../src/ui/AppTabs';
import { COLORS, type AppTabId } from '../../src/ui/theme';
import { Pressable, Text, View } from 'react-native';
import { AppIcon } from '../../src/ui/icons';

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = ((pathname.split('/').filter(Boolean).pop() || 'create')) as AppTabId;
  const auxiliary = !['create', 'agent'].includes(activeId);
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, minHeight: 52 }}>
        {auxiliary ? <Pressable accessibilityRole="button" accessibilityLabel="返回工作台" style={{ minHeight: 48, minWidth: 48, justifyContent: 'center' }} onPress={() => router.canGoBack() ? router.back() : router.navigate('/(tabs)/create')}><AppIcon name="arrow_back" size={22} /></Pressable> : <AppIcon name="auto_awesome" size={21} color={COLORS.primaryActive} />}
        <Text style={{ flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '700' }}>{activeId === 'agent' ? 'Agent 工作台' : activeId === 'create' ? '手工工作台' : ({assets:'素材',projects:'项目',tasks:'任务',settings:'设置',gallery:'历史作品'} as Record<string,string>)[activeId]}</Text>
        {!auxiliary ? <Pressable accessibilityRole="button" accessibilityLabel="打开素材库" style={{ minHeight: 48, minWidth: 48, alignItems:'center', justifyContent:'center' }} onPress={() => router.navigate('/(tabs)/assets')}><AppIcon name="grid_view" size={22} /></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="打开任务中心" style={{ minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', gap: 2 }} onPress={() => router.navigate('/(tabs)/tasks')}><AppIcon name="list_alt" size={22} color={COLORS.primaryActive} /><Text style={{ color: COLORS.textMuted, fontSize: 10 }}>任务</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="打开设置" style={{ minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' }} onPress={() => router.navigate('/(tabs)/settings')}><AppIcon name="settings" size={22} /></Pressable>
      </View>
      <Tabs
        initialRouteName="create"
        backBehavior="history"
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
        <Tabs.Screen name="assets" options={{ title: '素材' }} />
        <Tabs.Screen name="create" options={{ title: '生成' }} />
        <Tabs.Screen name="agent" options={{ title: '创作助手' }} />
        <Tabs.Screen name="tasks" options={{ title: '任务队列' }} />
        <Tabs.Screen name="gallery" options={{ title: '结果' }} />
        <Tabs.Screen name="settings" options={{ title: '设置' }} />
      </Tabs>
    </SafeAreaView>
  );
}
