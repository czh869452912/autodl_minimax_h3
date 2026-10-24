import { creativeError } from './creativeError';
import { useDraftSync } from './useDraftSync';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
import { prepareCreativeVideo, confirmCreativeVideo } from './videoRuntime';
import { PromptAssistSheet } from './PromptAssistSheet';
import { ParameterSheet, SectionHeading, SegmentedChoices, SettingRow, TextAction } from './WorkbenchUI';

export function VideoDraftScreen({ id }: { id: string }) {
  const router = useRouter();
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const [assist,setAssist]=useState(false);
  const [advanced, setAdvanced] = useState(false), [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<CreativeDraft>();
  const [input, setInput] = useState<z.output<typeof videoDraftInput>>();
  const [references, setReferences] = useState<Awaited<ReturnType<ReturnType<typeof creativeService>['draftInputs']>>>([]);
  const [referenceIndex, setReferenceIndex] = useState(0);
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
      Alert.alert('确认生成 1 个 H3 视频', `使用 AutoDL 生成 1 个视频，${inputRef.current.duration} 秒 · ${inputRef.current.resolution}。\n\n费用暂不可预估，本次允许提交 1 次，授权 15 分钟内有效。结果不明时不会自动重发。`, [
        { text: '取消', style: 'cancel', onPress: release },
        { text: '授权并生成', onPress: () => {
          void confirmCreativeVideo(preview).then(async () => { await load(); setNotice('已开始生成，结果会出现在这里。可离开后回来继续。'); }).catch(e => setError(creativeError(e, '提交失败'))).finally(release);
        } },
      ], { cancelable: false });
    } catch (e) { setError(creativeError(e, '无法准备生成')); release(); }
  };
  const style = s.input;
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
  const activeReference = references[Math.min(referenceIndex, Math.max(0, references.length - 1))];
  const editable = draft?.state === 'EDITING' && !busy;
  const referencePanel = <View style={{ gap: 12 }}>
    <SectionHeading title="参考画面" detail={`${references.length} / 9 张`} />
    {activeReference ? <>
      {activeReference.state === 'AVAILABLE' ? <Image accessibilityLabel={`参考图 ${references.indexOf(activeReference) + 1}`} source={{ uri: `${FileSystem.documentDirectory}${activeReference.relative_path}` }} style={[s.preview, { height: undefined, aspectRatio: 4 / 3 }]} resizeMode="contain" /> : <View style={s.card}><Text style={s.muted}>此参考图的原文件待恢复，请重新选择。</Text></View>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {references.map((ref, index) => <Pressable key={`${ref.version_id}:${index}`} accessibilityRole="button" accessibilityLabel={`查看参考图 ${index + 1}`} accessibilityState={{ selected: activeReference === ref }} onPress={() => setReferenceIndex(index)} style={{ width: 68, minHeight: 72, padding: 3, borderRadius: 10, borderWidth: 2, borderColor: activeReference === ref ? COLORS.primary : COLORS.border, gap: 3 }}>
          {ref.state === 'AVAILABLE' ? <Image source={{ uri: `${FileSystem.documentDirectory}${ref.relative_path}` }} style={{ width: '100%', height: 48, borderRadius: 5 }} /> : null}<Text style={[s.muted, { textAlign: 'center', fontSize: 12 }]}>{index + 1}</Text>
        </Pressable>)}
      </ScrollView>
    </> : <View style={[s.card, { backgroundColor: COLORS.surfaceRaised, borderWidth: 0 }]}><Text style={s.body}>添加一张画面，让它动起来</Text><Text style={s.muted}>从素材库选择，或导入手机中的图片。</Text></View>}
    {draft?.state === 'EDITING' ? <View style={s.row}>
      <TextAction label="从素材选择" icon="grid_view" disabled={busy || dirty || references.length >= 9} onPress={() => setPicking(true)} />
      <TextAction label="导入参考图" icon="add_photo_alternate" disabled={busy || dirty || references.length >= 9} onPress={() => void importReference()} />
      {activeReference ? <TextAction label={`移除参考图 ${references.indexOf(activeReference) + 1}`} disabled={busy || dirty} onPress={() => void replaceReferences(references.filter(r => r !== activeReference).map(r => r.version_id)).catch(e => setError(e.message))} /> : null}
    </View> : null}
  </View>;
  if(draft?.state==='SUBMITTED')return <SafeAreaView style={s.screen}>
    <View style={{paddingHorizontal:16}}><DraftHeading draft={draft} dirty={dirty} busy={busy} title="视频创作" /></View>
    <CreativeResults draft={draft} disabled={busy || dirty} dock />
  </SafeAreaView>;
  return <SafeAreaView style={s.screen}><KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}><ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} style={{ backgroundColor: COLORS.background }}>
    <DraftHeading draft={draft} dirty={dirty} busy={busy} title="视频创作" />
    {conflict ? <View style={s.card}><Text style={s.body}>这份草稿已在其他入口更新。本页输入仍保留，请先处理版本冲突。</Text><ListAction label="载入最新草稿" secondary disabled={busy} onPress={() => Alert.alert('载入最新草稿', '这会放弃本页尚未保存的修改。', [{ text: '保留本页', style: 'cancel' }, { text: '载入最新', onPress: () => void reload().catch(e => setError(e.message)) }])} /></View> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{error}{dirty ? ' · 本次修改尚未保存。' : ''}</Text> : null}
    {input && draft?.state === 'EDITING' ? <>
      {referencePanel}
      <View style={s.card}>
        <SectionHeading title="动作与运镜" detail="让画面成为一个镜头" />
        <TextInput accessibilityLabel="视频镜头提示词" placeholder="例如：镜头缓慢推近，雨滴从屋檐落下，街灯映在湿润的路面上…" placeholderTextColor={COLORS.textMuted} multiline value={input.prompt} editable={editable} onChangeText={prompt => update({ prompt })} style={[s.input, { borderWidth: 0, paddingHorizontal: 0, minHeight: 120, textAlignVertical: 'top' }]} />
        <TextAction label="帮我写提示词" icon="smart_toy" disabled={!editable} onPress={()=>setAssist(true)} />
      </View>
      <SettingRow label="画质与时长" value={`${input.resolution} · ${input.duration} 秒${input.seed ? ' · 固定种子' : ''}`} onPress={() => setAdvanced(true)} />
      {advanced ? <ParameterSheet title="视频设置" description="设置随草稿自动保存" onClose={() => setAdvanced(false)}>
        <SectionHeading title="画质与方向" />
        <SegmentedChoices label="视频画质与方向" options={RESOLUTION_OPTIONS.map(resolution => ({ id: resolution, label: resolution }))} value={input.resolution} disabled={!editable} onChange={resolution => update({ resolution })} />
        <SectionHeading title="时长" detail="1–15 秒" />
        <SegmentedChoices label="常用视频时长" options={[{id:'5',label:'5 秒'},{id:'10',label:'10 秒'},{id:'15',label:'15 秒'}]} value={String(input.duration)} disabled={!editable} onChange={value => update({duration:Number(value)})} />
        <Text style={s.muted}>自定义时长（秒）</Text><TextInput accessibilityLabel="视频时长" value={String(input.duration)} keyboardType="number-pad" editable={editable} onChangeText={value => update({ duration: Number(value) })} style={style} />
        <SectionHeading title="随机种子" detail="留空则随机" />
        <TextInput accessibilityLabel="视频种子" placeholder="Seed" keyboardType="number-pad" value={input.seed} editable={editable} onChangeText={seed => update({ seed })} style={style} />
        {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      </ParameterSheet> : null}
      {dirty && error ? <ListAction label="重试保存草稿" secondary disabled={busy} onPress={() => void save()} /> : null}

      {notice ? <Text style={{ color: COLORS.textMuted }}>{notice}</Text> : null}

      {draft?.state === 'EDITING' ? <CreativeAccountPanel provider="autodl" compact /> : null}
    </> : null}
  </ScrollView>
    {draft?.state === 'EDITING' ? <View style={s.footer}><Text style={s.muted}>H3 · 费用暂无法估算</Text><ListAction label={busy ? '处理中…' : '生成视频'} disabled={busy || conflict} onPress={() => void submit()} /></View> : null}
    {assist && input?<PromptAssistSheet prompt={input.prompt} kind="video" onApply={prompt=>update({prompt})} onClose={()=>setAssist(false)} />:null}
    {picking ? <CreativeAssetPicker kind="image" projectId={draft?.project_id ?? undefined} onClose={() => setPicking(false)} onChoose={v => replaceReferences([...references.map(r => r.version_id).filter(id => id !== v.id), v.id])} /> : null}
  </KeyboardAvoidingView></SafeAreaView>;
}
