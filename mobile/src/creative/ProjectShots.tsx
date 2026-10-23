import { useEffect, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { creativeService, creativeFiles } from './runtime';
import { createId } from '../ids';
import { ListAction } from '../ui/ListPageUI';
import { COLORS } from '../ui/theme';
import type { CreativeShot } from './story';
import type { CreativeCommand } from './types';

export function ProjectShots({ projectId, archived = false }: { projectId: string; archived?: boolean }) {
  const [shots, setShots] = useState<CreativeShot[]>([]);
  const [editing, setEditing] = useState<CreativeShot>();
  const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [choosing, setChoosing] = useState<{ shot: CreativeShot; slot: 'selected_image' | 'selected_video' }>();
  const [choices, setChoices] = useState<Array<{ id: string; title: string }>>([]);
  const refresh = async () => setShots(await creativeService().shots(projectId));
  useEffect(() => { void refresh().catch(() => setError('镜头读取失败')); }, [projectId]);
  const work = async (callback: () => Promise<unknown>) => {
    if (lock.current || archived) return; lock.current = true; setBusy(true); setError('');
    try { await callback(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  const command = (command: CreativeCommand) => creativeService().execute(command, createId());
  const action = (label: string, callback: () => void) => <ListAction label={label} secondary disabled={busy || archived} onPress={callback} />;
  const choose = (shot: CreativeShot, slot: 'selected_image' | 'selected_video') => work(async () => {
    const result = [];
    for (const asset of await creativeService().assets()) {
      if (asset.kind !== (slot === 'selected_image' ? 'image' : 'video')) continue;
      for (const version of await creativeService().versions(asset.id)) if (version.state === 'AVAILABLE') result.push({ id: version.id, title: `${asset.title} · 版本 ${version.versionNo}` });
    }
    setChoices(result); setChoosing({ shot, slot });
  });
  const reorder = (index: number, direction: number) => work(async () => {
    const ordered = [...shots]; [ordered[index], ordered[index + direction]] = [ordered[index + direction], ordered[index]];
    await command({ name: 'shot.reorder', payload: { projectId, shots: ordered.map(s => ({ id: s.id, expectedRevision: s.revision })) } });
  });
  const labels = { planned: '计划中', working: '制作中', review: '待审阅', approved: '已选定' };
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: COLORS.text, fontSize: 20, fontWeight: '700' }}>镜头清单</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{error}</Text> : null}
    {choosing ? <View style={{ gap: 8 }}><Text>选择精确版本；不会改变资产默认版本。</Text>
      {choices.map(c => <View key={c.id}>{action(c.title, () => void work(async () => { await creativeFiles().verify(c.id); await command({ name: 'shot.selectOutput', payload: { id: choosing.shot.id, expectedRevision: choosing.shot.revision, slot: choosing.slot, versionId: c.id } }); setChoosing(undefined); }))}</View>)}
      {!choices.length ? <Text>暂无本地可用候选，请先导入素材。</Text> : null}{action('取消选材', () => setChoosing(undefined))}
    </View> : null}
    {shots.map((shot, index) => <View key={shot.id} style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, gap: 8 }}>
      <Text style={{ color: COLORS.text, fontWeight: '700' }}>{index + 1}. {shot.title} · {labels[shot.editorial_status]}</Text><Text style={{ color: COLORS.textMuted }}>{shot.description || '尚未填写镜头描述'}</Text>
      <Text style={{ color: COLORS.textMuted }}>图片：{shot.selected_image ? '已固定版本' : '未选定'} · 视频：{shot.selected_video ? '已固定版本' : '未选定'}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {action('编辑镜头', () => { setEditing(shot); setTitle(shot.title); setDescription(shot.description); })}
        {action('选定图片', () => void choose(shot, 'selected_image'))}{action('选定视频', () => void choose(shot, 'selected_video'))}
        {index > 0 ? action('上移', () => void reorder(index, -1)) : null}{index < shots.length - 1 ? action('下移', () => void reorder(index, 1)) : null}
        {action('移除镜头', () => Alert.alert('移除镜头', '素材和版本仍保留在资产库。', [{ text: '取消', style: 'cancel' }, { text: '移除', onPress: () => void work(async () => { await command({ name: 'shot.delete', payload: { id: shot.id, expectedRevision: shot.revision } }); if (editing?.id === shot.id) { setEditing(undefined); setTitle(''); setDescription(''); } }) }]))}
      </View>
    </View>)}
    {!shots.length ? <Text style={{ color: COLORS.textMuted }}>添加镜头，逐个确定参考图和视频成果。</Text> : null}
    {!archived ? <View style={{ gap: 8 }}>
      <Text style={{ color: COLORS.text, fontWeight: '700' }}>{editing ? '编辑镜头' : '添加镜头'}</Text>
      <TextInput accessibilityLabel="镜头名称" placeholder="镜头名称" value={title} onChangeText={setTitle} style={{ borderWidth: 1, borderColor: COLORS.controlBorder, color: COLORS.text, padding: 12, borderRadius: 8 }} />
      <TextInput accessibilityLabel="镜头描述" placeholder="动作、运镜、节奏与声音" value={description} multiline onChangeText={setDescription} style={{ borderWidth: 1, borderColor: COLORS.controlBorder, color: COLORS.text, padding: 12, minHeight: 90, borderRadius: 8 }} />
      {action(editing ? '保存镜头' : '添加镜头', () => void work(async () => {
        await command(editing ? { name: 'shot.update', payload: { id: editing.id, expectedRevision: editing.revision, title, description, status: editing.editorial_status } } : { name: 'shot.create', payload: { projectId, title, description } });
        setEditing(undefined); setTitle(''); setDescription('');
      }))}
      {editing ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{Object.entries(labels).map(([status, label]) => <View key={status}>{action(label, () => setEditing({ ...editing, editorial_status: status as CreativeShot['editorial_status'] }))}</View>)}</View> : null}
    </View> : null}
  </View>;
}
