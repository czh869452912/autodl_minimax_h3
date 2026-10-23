import { useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { creativeService, creativeFiles } from './runtime';
import { videoDraftInput, type CreativeDraft } from './drafts';
import type { z } from 'zod';
import { createId } from '../ids';
import { ListAction } from '../ui/ListPageUI';
import { COLORS } from '../ui/theme';
import { RESOLUTION_OPTIONS } from '../create/resolutions';
import { CreativeAccountPanel } from './CreativeAccountPanel';
import { CopySubmittedDraft } from './CopySubmittedDraft';
import { prepareCreativeVideo, confirmCreativeVideo } from './videoRuntime';

export function VideoDraftScreen({ id }: { id: string }) {
  const router = useRouter();
  const navigation = useNavigation();
  const [draft, setDraft] = useState<CreativeDraft>();
  const [input, setInput] = useState<z.output<typeof videoDraftInput>>();
  const [references, setReferences] = useState<Awaited<ReturnType<ReturnType<typeof creativeService>['draftInputs']>>>([]);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const inputRef = useRef(input); inputRef.current = input;
  const dirty = Boolean(input && draft && JSON.stringify(input) !== draft.input_json);
  usePreventRemove(dirty || busy, ({ data }) => {
    if (lock.current) { Alert.alert('正在保存', '请等待本次保存完成后再离开。'); return; }
    Alert.alert('草稿尚未保存', '留在此页保存修改，或放弃未保存的修改后离开。已保存的内容仍会保留。', [
      { text: '继续编辑', style: 'cancel' },
      { text: '放弃修改并离开', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  const load = async () => {
    const service = creativeService(), row = await service.draft(id);
    if (!row) throw new Error('草稿不存在');
    const parsed = videoDraftInput.parse(JSON.parse(row.input_json));
    const refs = await service.draftInputs(id);
    for (const ref of refs) await creativeFiles().verify(ref.version_id);
    setDraft(row); setInput(parsed); setReferences(await service.draftInputs(id));
  };
  useEffect(() => { void load().catch(e => setError(e.message)); }, [id]);
  const save = async () => {
    if (lock.current || !draft || !inputRef.current || draft.state !== 'EDITING') return;
    lock.current = true; setBusy(true); setError(''); const snapshot = inputRef.current;
    try {
      await creativeService().execute({ name: 'draft.updateVideo', payload: { id, expectedRevision: draft.revision, input: snapshot } }, createId());
      const saved = await creativeService().draft(id);
      if (saved) setDraft(saved); setNotice('草稿已保存');
    } catch (e) { setError(e instanceof Error ? e.message : '草稿未保存'); }
    finally { lock.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (!dirty || busy || error || draft?.state !== 'EDITING') return;
    const timer = setTimeout(() => { void save(); }, 600);
    return () => clearTimeout(timer);
  }, [input, draft, busy, error, dirty]);
  const update = (patch: Partial<z.output<typeof videoDraftInput>>) => { setInput(value => value ? { ...value, ...patch } : value); setNotice('修改尚未保存'); setError(''); };
  const submit = async () => {
    if (lock.current || dirty) return;
    lock.current = true; setBusy(true); setError('');
    const release = () => { lock.current = false; setBusy(false); };
    try {
      const preview = await prepareCreativeVideo(id);
      Alert.alert('确认生成 1 个 H3 视频', `使用 AutoDL 凭据 ${preview.account.credential_generation_id.slice(-8)}。费用暂不可预估，本次允许提交 1 次，授权 15 分钟内有效。结果不明时不会自动重发。`, [
        { text: '取消', style: 'cancel', onPress: release },
        { text: '授权并生成', onPress: () => {
          void confirmCreativeVideo(preview).then(async () => { await load(); setNotice('任务已加入队列，可在全局任务页查看。生成结果保留为候选，不自动替换镜头选定版本。'); }).catch(e => setError(e instanceof Error ? e.message : '提交失败')).finally(release);
        } },
      ], { cancelable: false });
    } catch (e) { setError(e instanceof Error ? e.message : '无法准备生成'); release(); }
  };
  const style = { borderWidth: 1, borderColor: COLORS.controlBorder, color: COLORS.text, borderRadius: 8, padding: 12 };
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }} style={{ backgroundColor: COLORS.background }}>
    <Text accessibilityRole="header" style={{ color: COLORS.text, fontSize: 22, fontWeight: '700' }}>H3 视频草稿</Text>
    <Text style={{ color: COLORS.textMuted }}>参考图固定到创建草稿时选中的版本，之后镜头选图或资产默认变化不会替换它。</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{error} · 修改尚未保存时请留在此页处理。</Text> : null}
    {input ? <>
      <TextInput accessibilityLabel="视频镜头提示词" placeholder="描述动作、运镜、光影和声音；不自动复制图片标签" multiline value={input.prompt} editable={draft?.state === 'EDITING'} onChangeText={prompt => update({ prompt })} style={[style, { minHeight: 180, textAlignVertical: 'top' }]} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{RESOLUTION_OPTIONS.map(resolution => <ListAction key={resolution} label={`${input.resolution === resolution ? '✓ ' : ''}${resolution}`} secondary disabled={draft?.state !== 'EDITING'} onPress={() => update({ resolution })} />)}</View>
      <Text style={{ color: COLORS.text }}>时长（1–15 秒）</Text><TextInput accessibilityLabel="视频时长" value={String(input.duration)} keyboardType="number-pad" editable={draft?.state === 'EDITING'} onChangeText={value => update({ duration: Number(value) })} style={style} />
      <TextInput accessibilityLabel="视频种子" placeholder="Seed 留空则提交时生成" keyboardType="number-pad" value={input.seed} editable={draft?.state === 'EDITING'} onChangeText={seed => update({ seed })} style={style} />
      {references.map((ref, index) => <View key={`${ref.version_id}:${index}`}><Text style={{ color: COLORS.textMuted }}>参考图 {index + 1} · {ref.state === 'AVAILABLE' ? '本地可用' : '文件待恢复'}</Text>{ref.state === 'AVAILABLE' ? <Image source={{ uri: `${FileSystem.documentDirectory}${ref.relative_path}` }} style={{ height: 190, width: '100%' }} resizeMode="contain" /> : null}</View>)}
      <ListAction label={busy ? '正在保存…' : dirty ? '立即保存草稿' : '草稿已保存'} disabled={busy || !dirty || draft?.state !== 'EDITING'} onPress={() => void save()} />
      {draft?.state === 'EDITING' ? <><CreativeAccountPanel provider="autodl" /><ListAction label="确认并生成 H3 视频" disabled={busy || dirty} onPress={() => void submit()} /></> : <Text style={{ color: COLORS.text }}>已提交到任务队列</Text>}
      {notice ? <Text style={{ color: COLORS.textMuted }}>{notice}</Text> : null}
      {draft?.state==='SUBMITTED'?<CopySubmittedDraft id={id}/>:null}
      <ListAction label="查看全部创作草稿" secondary disabled={dirty || busy} onPress={() => router.push('/creative-drafts')} />
    </> : null}
  </ScrollView></KeyboardAvoidingView>;
}
