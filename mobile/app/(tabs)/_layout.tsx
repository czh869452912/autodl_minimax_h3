import {PrimaryNavigationProvider,PrimaryTabBar} from '../../src/navigation/PrimaryNavigation';
import {TaskInboxButton} from '../../src/tasks/TaskInboxButton';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS, type AppTabId } from '../../src/ui/theme';
import { Pressable, Text, View } from 'react-native';
import { AppIcon } from '../../src/ui/icons';

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = ((pathname.split('/').filter(Boolean).pop() || 'create')) as AppTabId;
  const auxiliary = !['create', 'agent', 'projects', 'assets'].includes(activeId);
  return (
    <PrimaryNavigationProvider><SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: COLORS.background }}>
      {activeId!=='agent' && activeId!=='create' && activeId!=='settings' && activeId!=='projects' && activeId!=='assets'?<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 48 }}>
        {auxiliary ? <Pressable accessibilityRole="button" accessibilityLabel="返回工作台" style={{ minHeight: 48, minWidth: 48, justifyContent: 'center' }} onPress={() => router.canGoBack() ? router.back() : router.navigate('/(tabs)/create')}><AppIcon name="arrow_back" size={22} /></Pressable> : null}
        <Text style={{ flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '700' }}>{({assets:'素材',projects:'项目',tasks:'任务',settings:'设置',gallery:'历史作品'} as Record<string,string>)[activeId]}</Text>
        <TaskInboxButton/>
        <Pressable accessibilityRole="button" accessibilityLabel="打开设置" style={{ minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' }} onPress={() => router.navigate('/settings-panel')}><AppIcon name="settings" size={22} /></Pressable>
      </View>:null}
      <Tabs
        initialRouteName="create"
        backBehavior="history"
        tabBar={props => <PrimaryTabBar {...props} />}
        screenOptions={{
          headerShown: false,
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
    </SafeAreaView></PrimaryNavigationProvider>
  );
}
