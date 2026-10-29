import { RecordRow } from '../ui/RecordRow';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const { projectId, view, createProject, requestId } = useLocalSearchParams<{ projectId?: string;view?:string;createProject?:string;requestId?:string }>();
  const router = useRouter();
  const [query,setQuery]=useState('');
  const [projects, setProjects] = useState<CreativeProject[]>([]);
  const [creating, setCreating] = useState(false), [title, setTitle] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [legacy,setLegacy]=useState(false);
  const lock = useRef(false);
  useFocusEffect(useCallback(() => { let active = true; void creativeService().projects().then(rows => { if (active) { setProjects(rows); setLoaded(true); } }).catch(() => { if (active) setError('项目读取失败，请重新进入工作台'); }); return () => { active = false; }; }, []));
  useEffect(()=>{if(createProject==='1'){setCreating(true);router.setParams({createProject:undefined});}},[createProject,requestId]);
  useEffect(()=>setLegacy(view==='all'),[view,requestId]);
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
  if(legacy && !projectId)return <View style={s.screen}><View style={{paddingHorizontal:16}}><TextAction label="返回项目选择" onPress={()=>{setLegacy(false);router.setParams({view:undefined});}} /></View><TextAction label="本地技能" onPress={()=>router.push('/agent-skills')} /><AgentScreen /></View>;
  if (projectId) return <View style={s.screen}><View style={{paddingHorizontal:12,flexDirection:'row',gap:12}}><TextAction label="返回项目选择" onPress={()=>router.setParams({projectId:undefined,view:undefined})}/><TextAction label="全部对话记录" onPress={()=>router.setParams({projectId:undefined,view:'all'})}/></View>
    <TextAction label="本地技能" onPress={()=>router.push('/agent-skills')} /><AgentScreen key={projectId} projectId={projectId} />
  </View>;
  return <View style={s.screen}><ScrollView contentContainerStyle={s.content}>
    <View style={s.row}><Text accessibilityRole="header" style={s.heading}>项目协作</Text><TextAction label="新建项目" onPress={()=>setCreating(true)}/></View>
    <Text style={s.muted}>在对话中规划画面、制作图片与视频，并审阅结果。</Text>
    <TextInput accessibilityLabel="搜索项目" placeholder="搜索项目名称或简报" value={query} onChangeText={setQuery} style={s.input}/>
    <Text style={s.title}>继续项目</Text>
    {projects.filter(p=>(p.title+' '+p.brief).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(p=><RecordRow key={p.id} title={p.title} detail={p.brief || '继续对话、草稿与成果'} meta={new Date(p.updatedAt).toLocaleDateString('zh-CN')} onPress={()=>enter(p.id)}/>)}
    {projects.length && !projects.some(p=>(p.title+' '+p.brief).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))?<Text style={s.muted}>没有匹配的项目</Text>:null}
    {loaded && !projects.length ? <Text style={s.muted}>建立第一个项目，让对话、草稿和成果保存在一起。</Text> : null}
    {!loaded && !error ? <Text style={s.muted}>正在读取项目…</Text> : null}
    <TextAction label="管理项目与分镜" onPress={() => router.push('/(tabs)/projects')} />
    <TextAction label="全部对话记录" onPress={()=>setLegacy(true)} />
    <TextAction label="本地技能" onPress={()=>router.push('/agent-skills')} />

    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </ScrollView>{creating ? <ParameterSheet title="新建创作项目" onClose={() => { if (!busy) setCreating(false); }}>
    <TextInput accessibilityLabel="Agent 项目名称" placeholder="项目名称" value={title} onChangeText={setTitle} maxLength={200} editable={!busy} style={s.input} autoFocus />
    <ListAction label={busy?'正在创建…':'创建并进入对话'} disabled={busy || !title.trim()} onPress={() => void create()} />
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </ParameterSheet> : null}</View>;
}
