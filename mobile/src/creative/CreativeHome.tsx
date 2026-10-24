import { readCreativeIdea, writeCreativeIdea, type CreativeIdea } from './creativeIdea';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { creativeService } from './runtime';
import { defaultNovelAiDraft } from './novelAiProtocol';
import type { CreativeDraft } from './drafts';
import { createId } from '../ids';
import { ListAction } from '../ui/ListPageUI';
import { creativeUI as s } from './creativeUI';
import { SectionHeading, SegmentedChoices, SettingRow, TextAction } from './WorkbenchUI';
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
  const [toolsOpen,setToolsOpen]=useState(false);
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
  return <View style={s.screen}><ScrollView contentContainerStyle={s.content}>
    <View style={{gap:8}}><Text accessibilityRole="header" style={s.heading}>专注完成一个画面</Text><Text style={s.muted}>你来选择参数与生成时机，助手可以帮你完善描述。</Text></View>
    <SegmentedChoices label="创作类型" options={[{id:'image',label:'图片',icon:'image'},{id:'video',label:'视频',icon:'movie_filter'}]} value={mode} disabled={!ideaReady || busy} onChange={setMode} />
    <ListAction label={busy?'正在准备…':mode==='image'?'进入图片工作台':'进入视频工作台'} disabled={busy || !ideaReady} onPress={()=>void start()} />
    {prompt?<Text style={s.muted}>上次未完成的描述会带入新草稿：{prompt.slice(0,100)}</Text>:null}
    {ideaError?<Text accessibilityRole="alert" style={s.error}>{ideaError}</Text>:null}
    {!ideaReady && ideaError?<TextAction label="重试恢复首页描述" onPress={()=>void readCreativeIdea().then(value=>{setIdea(value);setIdeaReady(true);setIdeaError('');}).catch(()=>setIdeaError('读取失败，请重试'))} />:null}
    {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
    <View style={{gap:4}}><View style={s.row}><SectionHeading title="继续创作" /><TextAction label="全部记录" onPress={()=>router.push('/creative-drafts')} /></View>
      {drafts.slice(0,6).map(d=><RecentCreation key={d.id} draft={d} onPress={()=>router.push({pathname:d.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:d.id}})} />)}
      {!drafts.length?<Text style={s.muted}>从一张图开始，草稿和成果会自动保留在这里。</Text>:null}
    </View>
    <SettingRow label="工具与项目" value="项目管理 · 工作流视频编辑器" expanded={toolsOpen} onPress={()=>setToolsOpen(!toolsOpen)} />
    {toolsOpen?<View style={{gap:4}}><TextAction label="管理项目与分镜" onPress={()=>router.push('/(tabs)/projects')} /><TextAction label="使用工作流视频编辑器" onPress={onLegacyVideo} /></View>:null}
  </ScrollView></View>;
}
