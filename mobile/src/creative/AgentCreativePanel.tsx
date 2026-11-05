import { RecordRow } from '../ui/RecordRow';
import { KeyboardSurface, KeyboardAwareScrollView as ScrollView } from '../ui/KeyboardSurface';
import { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { AppIcon } from '../ui/icons';
import { COLORS } from '../ui/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { getDatabase } from '../storage/databaseClient';
import { creativeService } from './runtime';
import { ListAction } from '../ui/ListPageUI';
import type { CreativeProject } from './types';
import { TextAction } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';

export function AgentCreativePanel({ threadId, running, compact=false, beforeNavigate }: { threadId: string; running: boolean; compact?:boolean; beforeNavigate?:(proceed:()=>void)=>void }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false), [projects, setProjects] = useState<CreativeProject[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState(''), [query, setQuery] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    const refresh = async () => {
      const scope = await getDatabase().getFirstAsync<{ project_id: string | null }>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?', threadId);
      const rows = await creativeService().projects();
      if (active) { setSelected(scope?.project_id ?? null); setProjects(rows); }
    };
    void refresh().catch(() => setNotice('项目范围读取失败'));
    const timer = setInterval(() => void refresh().catch(() => undefined), 2000);
    return () => { active = false; clearInterval(timer); };
  }, [threadId]));
  const choose = async (id: string | null) => {
    if (running || lock.current) return;
    // Open the target project's own conversation; never retarget this transcript.
    const proceed=()=>{if(id)router.setParams({projectId:id});setExpanded(false);};
    if(beforeNavigate)beforeNavigate(proceed);else proceed();
  };

  const projectTitle=projects.find(p => p.id === selected)?.title ?? (selected ? '项目不可用' : '选择项目');
  return <View style={compact?{flex:1}:{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
    {compact?<View><Pressable accessibilityRole="button" accessibilityLabel="切换创作项目" accessibilityHint={running?'当前正在运行，完成后可切换项目':'打开另一个项目的会话'} accessibilityState={{disabled:running||busy}} disabled={running || busy} onPress={()=>setExpanded(true)} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:4}}><Text numberOfLines={1} style={[s.title,{flexShrink:1}]}>{projectTitle}</Text><AppIcon name="expand_more" size={18}/></Pressable>{running?<Text style={{fontSize:12,color:COLORS.textMuted}}>运行中，暂不能切换项目</Text>:null}</View>:<View style={s.row}><Text style={s.muted}>当前项目：{projectTitle}</Text><TextAction label="项目" disabled={running || busy} onPress={() => setExpanded(true)} /></View>}
    {!selected && !compact ? <Text style={s.muted}>可先讨论想法。制作素材前，请选择项目或让助手创建项目后再选择。</Text> : null}
    {!expanded && notice && !compact ? <Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text> : null}
    {expanded ? <Modal visible animationType="slide" onRequestClose={() => setExpanded(false)}><SafeAreaView style={s.screen}><KeyboardSurface style={{flex:1}}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.row}><Text style={s.heading}>选择创作项目</Text><ListAction label="关闭" secondary onPress={() => setExpanded(false)} /></View>
      <TextInput accessibilityLabel="搜索创作项目" placeholder="搜索项目" value={query} onChangeText={setQuery} style={s.input} />
      {projects.filter(p => p.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(p => <RecordRow key={p.id} title={p.title} detail={p.brief || '项目会话与创作成果'} selected={p.id===selected} disabled={running || busy} onPress={() => void choose(p.id)} />)}
      <ListAction label="管理项目" secondary onPress={() => {const proceed=()=>{setExpanded(false);router.navigate('/(tabs)/projects');};if(beforeNavigate)beforeNavigate(proceed);else proceed();}} />

      {notice ? <Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text> : null}
    </ScrollView></KeyboardSurface></SafeAreaView></Modal> : null}
  </View>;
}
