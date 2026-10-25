import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AgentScreen from '../agent/AgentScreen';
import { creativeService } from './runtime';
import type { CreativeProject } from './types';
import { ListAction } from '../ui/ListPageUI';
import { ParameterSheet, TextAction } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';
import { createId } from '../ids';
import { AppIcon } from '../ui/icons';
import { COLORS } from '../ui/theme';

/** Project selection is separate from chat; existing conversations keep their scope. */
export function AgentWorkspace() {
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const router = useRouter();
  const [projects, setProjects] = useState<CreativeProject[]>([]);
  const [creating, setCreating] = useState(false), [title, setTitle] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [legacy,setLegacy]=useState(false);
  const lock = useRef(false);
  useFocusEffect(useCallback(() => { let active = true; void creativeService().projects().then(rows => { if (active) { setProjects(rows); setLoaded(true); } }).catch(() => { if (active) setError('项目读取失败，请重新进入工作台'); }); return () => { active = false; }; }, []));
  const enter = (id: string) => router.setParams({ projectId: id });
  const create = async () => {
    if (lock.current || !title.trim()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await creativeService().execute({ name:'project.create', payload:{title:title.trim()} }, createId());
      if (result.status !== 'completed') throw new Error('项目未创建，请重试');
      setCreating(false); setTitle(''); enter(result.value.projectId);
    } catch (e) { setError(e instanceof Error ? e.message : '项目创建失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  if(legacy)return <View style={s.screen}><View style={{paddingHorizontal:16}}><TextAction label="返回项目选择" onPress={()=>setLegacy(false)} /></View><AgentScreen /></View>;
  if (projectId) return <View style={s.screen}>
    <AgentScreen key={projectId} projectId={projectId} />
  </View>;
  return <View style={s.screen}><ScrollView contentContainerStyle={s.content}>
    <Text accessibilityRole="header" style={s.heading}>围绕项目，与 Agent 协作</Text>
    <Text style={s.muted}>在对话中规划画面、制作图片与视频，并审阅结果。</Text>
    <ListAction label="新建项目并开始对话" onPress={() => setCreating(true)} />
    <Text style={s.title}>继续项目</Text>
    {projects.map(p => <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.title} onPress={()=>enter(p.id)} style={({pressed})=>({flexDirection:'row',alignItems:'center',gap:12,minHeight:72,paddingVertical:12,borderBottomWidth:1,borderBottomColor:COLORS.border,opacity:pressed?0.65:1})}><View style={{flex:1,gap:4}}><Text style={s.title}>{p.title}</Text><Text numberOfLines={2} style={s.muted}>{p.brief || '从项目对话继续创作'}</Text></View><AppIcon name="chevron_right" size={20} color={COLORS.textMuted} /></Pressable>)}
    {loaded && !projects.length ? <Text style={s.muted}>建立第一个项目，让对话、草稿和成果保存在一起。</Text> : null}
    {!loaded && !error ? <Text style={s.muted}>正在读取项目…</Text> : null}
    <TextAction label="管理项目与分镜" onPress={() => router.push('/(tabs)/projects')} />
    <TextAction label="全部对话记录" onPress={()=>setLegacy(true)} />
    <Text style={s.muted}>当前为实验模式，使用已接入的创作工具。实际生成仍按项目授权执行。</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </ScrollView>{creating ? <ParameterSheet title="新建创作项目" onClose={() => { if (!busy) setCreating(false); }}>
    <TextInput accessibilityLabel="Agent 项目名称" placeholder="项目名称" value={title} onChangeText={setTitle} maxLength={200} editable={!busy} style={s.input} autoFocus />
    <ListAction label={busy?'正在创建…':'创建并进入对话'} disabled={busy || !title.trim()} onPress={() => void create()} />
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </ParameterSheet> : null}</View>;
}
