import { creativeError } from './creativeError';
import { useDraftSync } from './useDraftSync';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { DraftHeading } from './DraftHeading';
import { CreativeResults } from './CreativeResults';
import { CreativeAssetPicker } from './CreativeAssetPicker';
import { creativeUI as s } from './creativeUI';
import { pickImagesFromGallery } from '../native/imagePicker';
import { importCreativeImage } from './runtime';
import { CreativeAccountPanel } from './CreativeAccountPanel';
import { CopySubmittedDraft } from './CopySubmittedDraft';
import { prepareCreativeVideo, confirmCreativeVideo } from './videoRuntime';

export function VideoDraftScreen({ id }: { id: string }) {
  const router = useRouter();
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false), [picking, setPicking] = useState(false);
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
  const load = async (canApply = () => true) => {
    const service = creativeService(), row = await service.draft(id);
    if (!row) throw new Error('草稿不存在');
    const parsed = videoDraftInput.parse(JSON.parse(row.input_json));
    const refs = await service.draftInputs(id);
    for (const ref of refs) await creativeFiles().verify(ref.version_id);
    const checked = await service.draftInputs(id);
    if (canApply()) { setDraft(row); setInput(parsed); setReferences(checked); }
  };
  const { conflict, reload, assertCurrent } = useDraftSync(id, draft, dirty, busy, load, setError);
  useEffect(() => { if (error || conflict) scrollRef.current?.scrollTo({ y: 0, animated: true }); }, [error, conflict]);
  const save = async () => {
    if (lock.current || conflict || !draft || !inputRef.current || draft.state !== 'EDITING') return;
    lock.current = true; setBusy(true); setError(''); const snapshot = inputRef.current;
    try {
      await assertCurrent();
      await creativeService().execute({ name: 'draft.updateVideo', payload: { id, expectedRevision: draft.revision, input: snapshot } }, createId());
      const saved = await creativeService().draft(id);
      if (saved) setDraft(saved); setNotice('草稿已保存');
    } catch (e) { setError(creativeError(e, '草稿未保存')); }
    finally { lock.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (!dirty || busy || error || conflict || draft?.state !== 'EDITING') return;
    const timer = setTimeout(() => { void save(); }, 600);
    return () => clearTimeout(timer);
  }, [input, draft, busy, error, dirty, conflict]);
  const update = (patch: Partial<z.output<typeof videoDraftInput>>) => { setInput(value => value ? { ...value, ...patch } : value); setNotice('修改尚未保存'); setError(''); };
  const submit = async () => {
    if (lock.current || !draft || !inputRef.current || draft.state !== 'EDITING') return;
    lock.current = true; setBusy(true); setError('');
    const release = () => { lock.current = false; setBusy(false); };
    try {
      await assertCurrent();
      if (dirty) {
        await creativeService().execute({ name: 'draft.updateVideo', payload: { id, expectedRevision: draft.revision, input: inputRef.current } }, createId());
        const saved = await creativeService().draft(id); if (saved) setDraft(saved);
      }
      const preview = await prepareCreativeVideo(id);
      Alert.alert('确认生成 1 个 H3 视频', `使用 AutoDL 凭据 ${preview.account.credential_generation_id.slice(-8)}。费用暂不可预估，本次允许提交 1 次，授权 15 分钟内有效。结果不明时不会自动重发。`, [
        { text: '取消', style: 'cancel', onPress: release },
        { text: '授权并生成', onPress: () => {
          void confirmCreativeVideo(preview).then(async () => { await load(); setNotice('已开始生成，结果会出现在这里。可离开后回来继续。'); }).catch(e => setError(creativeError(e, '提交失败'))).finally(release);
        } },
      ], { cancelable: false });
    } catch (e) { setError(creativeError(e, '无法准备生成')); release(); }
  };
  const style = { borderWidth: 1, borderColor: COLORS.controlBorder, color: COLORS.text, borderRadius: 8, padding: 12 };
  const replaceReferences = async (versionIds: string[]) => {
    if (lock.current || !draft || dirty) throw new Error('请等待草稿保存后再选择参考图');
    lock.current = true; setBusy(true);
    try {
      await creativeService().execute({ name: 'draft.replaceInputs', payload: { id, expectedRevision: draft.revision, versionIds } }, createId());
      await load();
    } finally { lock.current = false; setBusy(false); }
  };
  const importReference = async () => {
    if (lock.current || !draft || dirty || references.length >= 9) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const [image] = await pickImagesFromGallery(1);
      if (!image) return;
      const result = await importCreativeImage(image, draft.project_id ?? undefined);
      if (result.status === 'completed') {
        await creativeService().execute({ name: 'draft.replaceInputs', payload: {
          id, expectedRevision: draft.revision,
          versionIds: [...references.map(r => r.version_id).filter(v => v !== result.value.versionId), result.value.versionId],
        } }, createId());
        await load();
      }
    } catch (e) { setError(creativeError(e, '参考图导入失败')); }
    finally { lock.current = false; setBusy(false); }
  };
  return <SafeAreaView style={s.screen}><KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}><ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} style={{ backgroundColor: COLORS.background }}>
    <DraftHeading draft={draft} dirty={dirty} busy={busy} title="视频创作" />
    {draft?.state === 'EDITING' ? <CreativeAccountPanel provider="autodl" compact /> : null}
    {draft?.state === 'SUBMITTED' ? <CreativeResults draft={draft} disabled={busy || dirty} /> : null}
    <Text style={{ color: COLORS.textMuted }}>描述画面中的动作与运镜，让参考图成为一个镜头。</Text>
    {conflict ? <View style={s.card}><Text style={s.body}>这份草稿已在其他入口更新。本页输入仍保留，请先处理版本冲突。</Text><ListAction label="载入最新草稿" secondary disabled={busy} onPress={() => Alert.alert('载入最新草稿', '这会放弃本页尚未保存的修改。', [{ text: '保留本页', style: 'cancel' }, { text: '载入最新', onPress: () => void reload().catch(e => setError(e.message)) }])} /></View> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{error}{dirty ? ' · 本次修改尚未保存。' : ''}</Text> : null}
    {draft?.state === 'SUBMITTED' ? <><CopySubmittedDraft id={id}/><ListAction label={recipeOpen ? '收起生成参数' : '查看本次生成参数'} secondary onPress={() => setRecipeOpen(!recipeOpen)} /></> : null}
    {input && (draft?.state === 'EDITING' || recipeOpen) ? <>
      <Text style={s.title}>动作与运镜</Text>
      <TextInput accessibilityLabel="视频镜头提示词" placeholder="描述动作、运镜、光影和声音；不自动复制图片标签" multiline value={input.prompt} editable={draft?.state === 'EDITING' && !busy} onChangeText={prompt => update({ prompt })} style={[style, { minHeight: 180, textAlignVertical: 'top' }]} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{RESOLUTION_OPTIONS.map(resolution => <ListAction key={resolution} label={`${input.resolution === resolution ? '✓ ' : ''}${resolution}`} secondary disabled={draft?.state !== 'EDITING' || busy} onPress={() => update({ resolution })} />)}</View>
      <Text style={{ color: COLORS.text }}>时长（1–15 秒）</Text><TextInput accessibilityLabel="视频时长" value={String(input.duration)} keyboardType="number-pad" editable={draft?.state === 'EDITING' && !busy} onChangeText={value => update({ duration: Number(value) })} style={style} />
      <ListAction label={advanced ? "收起高级设置" : "高级设置"} secondary onPress={() => setAdvanced(!advanced)} />
      {advanced ? <TextInput accessibilityLabel="视频种子" placeholder="Seed 留空则提交时生成" keyboardType="number-pad" value={input.seed} editable={draft?.state === 'EDITING' && !busy} onChangeText={seed => update({ seed })} style={style} /> : null}
      <Text style={s.title}>参考图 · {references.length} / 9</Text>
      {references.map((ref, index) => <View key={`${ref.version_id}:${index}`}><Text style={{ color: COLORS.textMuted }}>参考图 {index + 1} · {ref.state === 'AVAILABLE' ? '本地可用' : '文件待恢复'}</Text>{ref.state === 'AVAILABLE' ? <Image source={{ uri: `${FileSystem.documentDirectory}${ref.relative_path}` }} style={{ height: 190, width: '100%' }} resizeMode="contain" /> : null}{draft?.state === 'EDITING' ? <ListAction label={`移除参考图 ${index + 1}`} secondary disabled={busy || dirty} onPress={() => void replaceReferences(references.filter((_, i) => i !== index).map(r => r.version_id)).catch(e => setError(e.message))} /> : null}</View>)}
      {draft?.state === 'EDITING' ? <View style={s.row}><ListAction label="从素材选择" secondary disabled={busy || dirty || references.length >= 9} onPress={() => setPicking(true)} /><ListAction label="导入参考图" secondary disabled={busy || dirty || references.length >= 9} onPress={() => void importReference()} /></View> : null}
      {dirty && error ? <ListAction label="重试保存草稿" secondary disabled={busy} onPress={() => void save()} /> : null}

      {notice ? <Text style={{ color: COLORS.textMuted }}>{notice}</Text> : null}

      <ListAction label="查看全部创作草稿" secondary disabled={dirty || busy} onPress={() => router.push('/creative-drafts')} />
    </> : null}
  </ScrollView>
    {draft?.state === 'EDITING' ? <View style={s.footer}><Text style={s.muted}>H3 · 费用暂无法估算</Text><ListAction label={busy ? '处理中…' : '生成视频'} disabled={busy || conflict} onPress={() => void submit()} /></View> : null}
    {picking ? <CreativeAssetPicker kind="image" projectId={draft?.project_id ?? undefined} onClose={() => setPicking(false)} onChoose={v => replaceReferences([...references.map(r => r.version_id).filter(id => id !== v.id), v.id])} /> : null}
  </KeyboardAvoidingView></SafeAreaView>;
}
