import { readCreativeIdea, writeCreativeIdea, type CreativeIdea } from './creativeIdea';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { creativeService } from './runtime';
import { defaultNovelAiDraft } from './novelAiProtocol';
import type { CreativeDraft } from './drafts';
import { createId } from '../ids';
import { ListAction, ListFilters } from '../ui/ListPageUI';
import { creativeUI as s } from './creativeUI';

export function CreativeHome({ onLegacyVideo }: { onLegacyVideo: () => void }) {
  const router = useRouter();
  const [idea, setIdea] = useState<CreativeIdea>({ mode: 'image', image: '', video: '' });
  const [ideaReady, setIdeaReady] = useState(false), [ideaError, setIdeaError] = useState('');
  const ideaRef = useRef(idea); ideaRef.current = idea;
  const mode = idea.mode, prompt = idea[mode];
  useEffect(() => { let active = true; void readCreativeIdea().then(value => { if (active) { setIdea(value); setIdeaReady(true); } }).catch(e => { if (active) setIdeaError('首页描述读取失败，请重试恢复'); }); return () => { active = false; }; }, []);
  const updateIdea = (patch: Partial<CreativeIdea>) => {
    const next = { ...ideaRef.current, ...patch }; ideaRef.current = next; setIdea(next);
    void writeCreativeIdea(next).then(() => setIdeaError('')).catch(() => setIdeaError('首页描述未能保存，请先进入工作台保存草稿。'));
  };
  const setMode = (mode: 'image' | 'video') => updateIdea({ mode });
  const setPrompt = (prompt: string) => updateIdea({ [mode]: prompt });
  const [drafts, setDrafts] = useState<CreativeDraft[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void creativeService().drafts().then(rows => { if (active) setDrafts(rows); }).catch(() => { if (active) setError('草稿读取失败，请重新进入此页重试'); });
    return () => { active = false; };
  }, []));
  const start = async () => {
    if (lock.current || !ideaReady) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await creativeService().execute(mode === 'image'
        ? { name: 'draft.createImage', payload: { input: { ...defaultNovelAiDraft, prompt } } }
        : { name: 'draft.createVideo', payload: { prompt } }, createId());
      if (result.status === 'completed') { setPrompt(''); router.push({ pathname: mode === 'image' ? '/image-draft/[id]' : '/creative-draft/[id]', params: { id: result.value.draftId } }); }
    } catch (e) { setError(e instanceof Error ? e.message : '无法创建草稿，输入仍保留'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <KeyboardAvoidingView behavior="padding" style={s.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Text accessibilityRole="header" style={s.heading}>开始创作</Text>
    <Text style={s.muted}>从一个画面开始，也可以继续上次的灵感。</Text>
    <ListFilters label="创作类型" options={[{ id: 'image', label: '图片' }, { id: 'video', label: '视频' }]} value={mode} onChange={value => { if (ideaReady && !busy) setMode(value); }} />
    <View style={s.card}>
      <Text style={s.title}>{mode === 'image' ? '你想画什么？' : '这个镜头如何展开？'}</Text>
      <TextInput accessibilityLabel="创作描述" placeholder={mode === 'image' ? '描述画面、风格和构图…' : '描述动作、运镜、节奏与声音…'} value={prompt} editable={ideaReady && !busy} maxLength={10000} onChangeText={setPrompt} multiline style={[s.input, s.multiline]} />
      <Text style={s.muted}>{mode === 'image' ? 'NovelAI · 可在下一步调整比例与角色' : 'H3 · 可在下一步添加参考图与设置时长'}</Text>
      <ListAction label={busy ? '正在准备…' : mode === 'image' ? '进入图片工作台' : '进入视频工作台'} disabled={busy || !ideaReady} onPress={() => void start()} />
      <Text style={s.muted}>无需新建项目。准备草稿不会开始生成。</Text>
    </View>
    {ideaError ? <Text accessibilityRole="alert" style={s.error}>{ideaError}</Text> : null}
    {!ideaReady && ideaError ? <ListAction label="重试恢复首页描述" secondary onPress={() => void readCreativeIdea().then(value => { setIdea(value); setIdeaReady(true); setIdeaError(''); }).catch(e => setIdeaError(e.message))} /> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <View style={s.row}><Text style={s.title}>继续创作</Text><ListAction label="全部草稿" secondary onPress={() => router.push('/creative-drafts')} /></View>
    {drafts.slice(0, 4).map(d => <View key={d.id} style={s.card}>
      <Text style={s.muted}>{d.provider_id === 'novelai' ? '图片' : '视频'} · {d.state === 'EDITING' ? '编辑中' : '已提交，可查看进度与结果'}</Text>
      <Text style={s.body} numberOfLines={2}>{JSON.parse(d.input_json).prompt || '尚未填写描述'}</Text>
      <ListAction label={d.state === 'EDITING' ? '继续编辑' : '查看这次创作'} secondary onPress={() => router.push({ pathname: d.provider_id === 'novelai' ? '/image-draft/[id]' : '/creative-draft/[id]', params: { id: d.id } })} />
    </View>)}
    {!drafts.length ? <Text style={s.muted}>草稿和生成记录会保留在这里，随时回来继续。</Text> : null}
    <ListAction label="使用工作流视频编辑器" secondary onPress={onLegacyVideo} />
  </ScrollView></KeyboardAvoidingView>;
}
