import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { creativeService } from './runtime';
import type { CreativeDraft } from './drafts';
import { TextAction } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';

export function DraftHeading({ draft, dirty, busy, title }: { draft?: CreativeDraft; dirty: boolean; busy: boolean; title: string }) {
  const router = useRouter();
  const [context, setContext] = useState('个人创作');
  useEffect(() => {
    let active = true;
    if (draft?.project_id) void creativeService().project(draft.project_id).then(p => { if (active) setContext(p?.title ?? '项目不可用'); }).catch(() => { if (active) setContext('项目读取失败'); });
    else setContext('个人创作');
    return () => { active = false; };
  }, [draft?.project_id]);
  return <View style={{ gap: 4 }}>
    <View style={[s.row, { flexWrap: 'nowrap', gap: 12 }]}>
      <TextAction label="返回" icon="arrow_back" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/create')} />
      <Text accessibilityRole="header" style={[s.title, { flex: 1 }]}>{title}</Text>
      <Text accessibilityLiveRegion="polite" style={[s.muted, { flexShrink: 1 }]}>{busy ? '处理中…' : dirty ? '待保存' : draft ? draft.state === 'EDITING' ? '已保存' : '已提交' : '读取中…'}</Text>
    </View>
    <Text style={s.muted}>{context}</Text>
  </View>;
}
