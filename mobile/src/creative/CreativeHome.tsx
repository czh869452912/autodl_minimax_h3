import { readCreativeIdea, writeCreativeIdea, type CreativeIdea } from './creativeIdea';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { creativeService } from './runtime';
import { defaultNovelAiDraft } from './novelAiProtocol';
import type { CreativeDraft } from './drafts';
import { createId } from '../ids';
import { ListAction } from '../ui/ListPageUI';
import { creativeUI as s } from './creativeUI';
import { SectionHeading, SegmentedChoices, TextAction } from './WorkbenchUI';
import { MediaPreview } from './MediaPreview';
import type { AssetVersion } from './types';
import { COLORS } from '../ui/theme';

function RecentCreation({ draft, onPress }: { draft: CreativeDraft; onPress: () => void }) {
  const input=JSON.parse(draft.input_json),name=input.operation==='upscale'?'图片超分 · 2×':input.prompt||'新的灵感';
  const [version, setVersion] = useState<AssetVersion>();
  useEffect(() => {
    let active = true;
    if (draft.target_asset_id) void creativeService().versions(draft.target_asset_id).then(rows => { if (active) setVersion(rows.find(v => v.recipe.jobId === draft.job_id) ?? rows[0]); }).catch(() => undefined);
    return () => { active = false; };
  }, [draft.target_asset_id, draft.job_id, draft.revision]);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${draft.state === 'EDITING' ? '继续编辑' : '查看这次创作'}：${name}`} onPress={onPress} style={({pressed}) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, opacity: pressed ? 0.65 : 1 }]}>
    <MediaPreview version={version} kind={draft.provider_id === 'novelai' ? 'image' : 'video'} label="创作预览" style={{ width: 72, aspectRatio: 1 }} />
    <View style={{ flex: 1, gap: 4 }}><Text style={[s.body, { fontWeight: '600' }]} numberOfLines={2}>{name}</Text><Text style={s.muted}>{draft.provider_id === 'novelai' ? '图片' : '视频'} · {draft.state === 'EDITING' ? '草稿 · 继续编辑' : version ? '查看成果' : '查看生成进度'}</Text></View>
  </Pressable>;
}

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
    <View style={{ paddingTop: 8, gap: 8 }}><Text accessibilityRole="header" style={[s.heading, { fontSize: 30 }]}>灵感，从这里开始</Text>
    <Text style={s.muted}>画一幅图，让一个镜头动起来。</Text></View>
    <View style={[s.card, { borderWidth: 0, padding: 16, gap: 16 }]}>
      <SegmentedChoices label="创作类型" options={[{ id: 'image', label: '图片', icon: 'add_photo_alternate' }, { id: 'video', label: '视频', icon: 'movie_filter' }]} value={mode} disabled={!ideaReady || busy} onChange={setMode} />
      <Text style={s.title}>{mode === 'image' ? '你想画什么？' : '这个镜头如何展开？'}</Text>
      <TextInput accessibilityLabel="创作描述" placeholder={mode === 'image' ? '描述你脑海中的画面、风格和构图…' : '描述动作、镜头运动和声音…'} placeholderTextColor={COLORS.textMuted} value={prompt} editable={ideaReady && !busy} maxLength={10000} onChangeText={setPrompt} multiline style={[s.input, s.multiline, { borderWidth: 0, paddingHorizontal: 0, minHeight: 110 }]} />
      <ListAction label={busy ? '正在准备…' : mode === 'image' ? '进入图片工作台' : '进入视频工作台'} disabled={busy || !ideaReady} onPress={() => void start()} />
      <Text style={[s.muted, { textAlign: 'center', fontSize: 12 }]}>自动保留草稿 · 生成前确认 · 无需新建项目</Text>
    </View>
    {!prompt ? <View style={{ gap: 4 }}><Text style={s.muted}>试试一个灵感</Text>{(mode === 'image' ? ['雨后的街角书店，暖光，水彩风格', '月光下的森林小屋，电影感构图'] : ['镜头缓慢推近，树影随风轻轻摇动', '人物转身望向远方，镜头跟随移动']).map(example => <TextAction key={example} label={example} disabled={!ideaReady || busy} onPress={() => setPrompt(example)} />)}</View> : null}
    {ideaError ? <Text accessibilityRole="alert" style={s.error}>{ideaError}</Text> : null}
    {!ideaReady && ideaError ? <ListAction label="重试恢复首页描述" secondary onPress={() => void readCreativeIdea().then(value => { setIdea(value); setIdeaReady(true); setIdeaError(''); }).catch(e => setIdeaError(e.message))} /> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <View style={{ gap: 4 }}><View style={s.row}><SectionHeading title="继续创作" /><TextAction label="全部草稿" onPress={() => router.push('/creative-drafts')} /></View>
    {drafts.slice(0, 4).map(d => <RecentCreation key={d.id} draft={d} onPress={() => router.push({ pathname: d.provider_id === 'novelai' ? '/image-draft/[id]' : '/creative-draft/[id]', params: { id: d.id } })} />)}
    {!drafts.length ? <Text style={s.muted}>草稿和生成记录会保留在这里，随时回来继续。</Text> : null}
    </View>
    <TextAction label="使用工作流视频编辑器" icon="movie_filter" onPress={onLegacyVideo} />
  </ScrollView></KeyboardAvoidingView>;
}
