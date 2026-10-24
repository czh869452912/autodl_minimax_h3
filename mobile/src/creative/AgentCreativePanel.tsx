import { useCallback, useRef, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getDatabase } from '../storage/databaseClient';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { creativeService } from './runtime';
import { creativeBudget } from './accountRuntime';
import { ListAction } from '../ui/ListPageUI';
import type { CreativeProject } from './types';
import { TextAction } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';

export function AgentCreativePanel({ threadId, running }: { threadId: string; running: boolean }) {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
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
    if (projectId) { router.setParams({projectId:id ?? ''}); setExpanded(false); return; }
    lock.current = true; setBusy(true);
    try {
      await withWriteTransaction(getDatabase(), async tx => {
        if (!await tx.getFirstAsync('SELECT thread_id FROM agent_thread_index WHERE thread_id=? AND deleted=0', threadId)) throw new Error('会话不存在');
        if (id && !await tx.getFirstAsync('SELECT id FROM creative_projects WHERE id=? AND archived_at IS NULL', id)) throw new Error('项目已不可用');
        await tx.runAsync('INSERT INTO creative_agent_scopes VALUES(?,?,0,?) ON CONFLICT(thread_id) DO UPDATE SET project_id=excluded.project_id,revision=creative_agent_scopes.revision+1,updated_at=excluded.updated_at', threadId, id, Date.now());
      });
      setSelected(id); setExpanded(false); setNotice('项目已切换，已提交的任务仍归属原项目。');
    } catch (e) { setNotice(e instanceof Error ? e.message : '项目切换失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
    <View style={s.row}><Text style={s.muted}>当前项目：{projects.find(p => p.id === selected)?.title ?? (selected ? '项目不可用' : '未选择')}</Text><TextAction label="项目" disabled={running || busy} onPress={() => setExpanded(true)} /></View>
    {projectId && projectId !== selected ? <ListAction label={`在此会话使用 ${projects.find(p => p.id === projectId)?.title ?? '所选项目'}`} disabled={running || busy} onPress={() => void choose(projectId)} /> : null}
    {!selected ? <Text style={s.muted}>可先讨论想法。制作素材前，请选择项目或让助手创建项目后再选择。</Text> : null}
    {!expanded && notice ? <Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text> : null}
    {expanded ? <Modal visible animationType="slide" onRequestClose={() => setExpanded(false)}><SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.row}><Text style={s.heading}>选择创作项目</Text><ListAction label="关闭" secondary onPress={() => setExpanded(false)} /></View>
      <TextInput accessibilityLabel="搜索创作项目" placeholder="搜索项目" value={query} onChangeText={setQuery} style={s.input} />
      {projects.filter(p => p.title.includes(query)).map(p => <ListAction key={p.id} label={`${p.id === selected ? '✓ ' : ''}${p.title}`} secondary disabled={running || busy} onPress={() => void choose(p.id)} />)}
      <ListAction label="查看项目与新建项目" secondary onPress={() => { setExpanded(false); router.push('/(tabs)/projects'); }} />
      <ListAction label="清除项目范围，仅讨论或创建项目" secondary disabled={running || busy} onPress={() => void choose(null)} />
      {selected ? <ListAction label="撤销当前项目全部生成授权" secondary disabled={busy} onPress={() => {
        if (lock.current) return; lock.current = true; setBusy(true);
        void creativeBudget().list().then(async rows => { for (const row of rows) if (row.project_id === selected && row.revoked_at == null) await creativeBudget().revoke(row.id); setNotice('当前项目授权已撤销'); }).catch(() => setNotice('撤销失败')).finally(() => { lock.current = false; setBusy(false); });
      }} /> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text> : null}
    </ScrollView></SafeAreaView></Modal> : null}
  </View>;
}
