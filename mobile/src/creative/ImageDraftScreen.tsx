import { useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import * as FileSystem from 'expo-file-system/legacy';
import { creativeService } from './runtime';
import { novelAiDraftInput, NOVELAI_MODELS, type NovelAiDraftInput } from './novelAiProtocol';
import { prepareCreativeImage, confirmCreativeImage } from './novelAiRuntime';
import { CreativeAccountPanel } from './CreativeAccountPanel';
import type { CreativeDraft } from './drafts';
import type { AssetVersion } from './types';
import { createId } from '../ids';
import { ListAction } from '../ui/ListPageUI';
import { COLORS } from '../ui/theme';

export function ImageDraftScreen({ id }: { id: string }) {
  const router = useRouter(), navigation = useNavigation();
  const [draft, setDraft] = useState<CreativeDraft>(); const [input, setInput] = useState<NovelAiDraftInput>();
  const [advanced, setAdvanced] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const lock = useRef(false), latest = useRef(input); latest.current = input;
  const dirty = Boolean(input && draft && JSON.stringify(input) !== draft.input_json);
  const editable = draft?.state === 'EDITING' && !busy;
  usePreventRemove(dirty || busy, ({ data }) => {
    if (lock.current) { Alert.alert('操作进行中', '请等待保存或提交完成。'); return; }
    Alert.alert('修改尚未保存', '是否放弃本次未保存修改？', [{ text: '继续编辑', style: 'cancel' }, { text: '放弃并离开', style: 'destructive', onPress: () => navigation.dispatch(data.action) }]);
  });
  const load = async () => { const row = await creativeService().draft(id); if (!row) throw new Error('草稿不存在'); setDraft(row); setInput(novelAiDraftInput.parse(JSON.parse(row.input_json))); };
  useEffect(() => { void load().catch(e => setError(e.message)); }, [id]);
  useEffect(() => {
    if (!draft?.target_asset_id) return;
    let cancelled = false;
    const refresh = async () => { const rows = await creativeService().versions(draft.target_asset_id!); if (!cancelled) setVersions(rows); };
    void refresh().catch(() => undefined); const timer = setInterval(() => { void refresh().catch(() => undefined); }, 2500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [draft?.target_asset_id]);
  const save = async () => {
    if (lock.current || !draft || !latest.current || draft.state !== 'EDITING') return;
    lock.current = true; setBusy(true); setError('');
    try { await creativeService().execute({ name: 'draft.updateImage', payload: { id, expectedRevision: draft.revision, input: latest.current } }, createId()); const row = await creativeService().draft(id); if (row) setDraft(row); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  useEffect(() => { if (!dirty || busy || error) return; const timer = setTimeout(() => { void save(); }, 600); return () => clearTimeout(timer); }, [input, draft, dirty, busy, error]);
  const update = (patch: Partial<NovelAiDraftInput>) => { setInput(old => old ? { ...old, ...patch } : old); setError(''); };
  const submit = async () => {
    if (lock.current || dirty) return; lock.current = true; setBusy(true); setError('');
    const release = () => { lock.current = false; setBusy(false); };
    try {
      const preview = await prepareCreativeImage(id);
      Alert.alert('确认生成 1 张图片', `NovelAI 凭据 ${preview.account.credential_generation_id.slice(-8)}，Seed ${preview.prepared.inputSnapshot.seed}。费用暂不可预估；本次授权 1 次生成，有效期 15 分钟。Opus 不代表所有参数均免费。`, [
        { text: '取消', style: 'cancel', onPress: release },
        { text: '授权并生成', onPress: () => { void confirmCreativeImage(preview).then(load).catch(e => setError(e instanceof Error ? e.message : '提交失败')).finally(release); } },
      ], { cancelable: false });
    } catch (e) { setError(e instanceof Error ? e.message : '准备失败'); release(); }
  };
  const fieldStyle = { borderWidth: 1, borderColor: COLORS.controlBorder, borderRadius: 8, padding: 12, color: COLORS.text };
  const numberField = (label: string, key: 'width'|'height'|'steps'|'guidance'|'rescale') => <View key={key}><Text style={{ color: COLORS.text }}>{label}</Text><TextInput accessibilityLabel={label} value={String(input![key])} editable={editable} keyboardType="decimal-pad" onChangeText={value => update({ [key]: Number(value) })} style={fieldStyle} /></View>;
  const continueVersion = async (v: AssetVersion, video: boolean) => {
    try {
      const result = await creativeService().execute(video ? { name: 'draft.createVideo', payload: { versionId: v.id, projectId: draft?.project_id ?? undefined } } : { name: 'draft.createImage', payload: { fromVersionId: v.id, projectId: draft?.project_id ?? undefined } }, createId());
      if (result.status === 'completed') router.push({ pathname: video ? '/creative-draft/[id]' : '/image-draft/[id]', params: { id: result.value.draftId } });
    } catch (e) { setError(e instanceof Error ? e.message : '创建草稿失败'); }
  };
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: COLORS.background }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: COLORS.text, fontSize: 22, fontWeight: '700' }}>NovelAI 图片创作</Text>
      {error ? <Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{error}</Text> : null}
      {versions.map(v => <View key={v.id} style={{ gap: 8 }}>{v.relativePath ? <Image source={{ uri: `${FileSystem.documentDirectory}${v.relativePath}` }} style={{ height: 380, width: '100%' }} resizeMode="contain" /> : null}<Text style={{ color: COLORS.text }}>版本 {v.versionNo} · 候选；请在项目或资产页明确采用</Text><View style={{ flexDirection: 'row', gap: 8 }}><ListAction label="按此版本继续出图" disabled={busy || dirty} onPress={() => void continueVersion(v, false)} /><ListAction label="选此图制作 H3 视频" disabled={busy || dirty || v.state !== 'AVAILABLE'} secondary onPress={() => void continueVersion(v, true)} /></View></View>)}
      {input ? <>
        <TextInput accessibilityLabel="图片提示词" placeholder="画面、风格与构图" value={input.prompt} onChangeText={prompt => update({ prompt })} editable={editable} multiline style={[fieldStyle, { minHeight: 130, textAlignVertical: 'top' }]} />
        <TextInput accessibilityLabel="图片负面提示词" placeholder="不希望出现的内容" value={input.negative} onChangeText={negative => update({ negative })} editable={editable} multiline style={fieldStyle} />
        <Text style={{ color: COLORS.textMuted }}>提示词按输入原样发送；不会自动加入质量标签或负面预设。</Text>
        {input.characters.map((c, index) => <View key={index} style={{ padding: 12, borderWidth: 1, borderColor: COLORS.border, gap: 8 }}>
          <Text style={{ color: COLORS.text }}>角色 {index + 1}</Text>
          <TextInput accessibilityLabel={`角色 ${index + 1} 提示词`} value={c.prompt} editable={editable} multiline onChangeText={prompt => update({ characters: input.characters.map((v,i) => i === index ? { ...v,prompt } : v) })} style={fieldStyle} />
          <TextInput accessibilityLabel={`角色 ${index + 1} 负面`} value={c.negative} editable={editable} multiline onChangeText={negative => update({ characters: input.characters.map((v,i) => i === index ? { ...v,negative } : v) })} style={fieldStyle} />
          {input.useCoordinates ? <View style={{ flexDirection: 'row', gap: 8 }}>{(['x','y'] as const).map(axis => <TextInput key={axis} accessibilityLabel={`角色 ${index+1} ${axis}（0到1）`} value={String(c[axis])} keyboardType="decimal-pad" editable={editable} onChangeText={value => update({ characters: input.characters.map((v,i) => i === index ? { ...v,[axis]: Number(value) } : v) })} style={[fieldStyle,{flex:1}]} />)}</View> : null}
          <ListAction label={`移除角色 ${index+1}`} secondary disabled={!editable} onPress={() => update({ characters: input.characters.filter((_,i) => i !== index) })} />
        </View>)}
        <ListAction label="添加角色（最多 6 个）" secondary disabled={!editable || input.characters.length >= 6} onPress={() => update({ characters: [...input.characters,{ prompt:'', negative:'', x:0.5, y:0.5 }] })} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ color: COLORS.text }}>指定角色位置</Text><Switch accessibilityLabel="指定角色位置" value={input.useCoordinates} disabled={!editable} onValueChange={useCoordinates => update({ useCoordinates })} /></View>
        <ListAction label={advanced ? '收起生成参数' : '生成参数'} secondary onPress={() => setAdvanced(!advanced)} />
        {advanced ? <>
          {NOVELAI_MODELS.map(model => <ListAction key={model} label={`${input.model === model ? '✓ ' : ''}${model}`} secondary disabled={!editable} onPress={() => update({ model, noiseSchedule: model === 'nai-diffusion-5-curated' ? 'karras' : input.noiseSchedule })} />)}
          {numberField('宽度（64 的倍数）','width')}{numberField('高度（64 的倍数）','height')}{numberField('步数','steps')}{numberField('引导强度','guidance')}{numberField('Rescale','rescale')}
          <TextInput accessibilityLabel="图片 Seed" placeholder="Seed 留空则随机" value={input.seed == null ? '' : String(input.seed)} editable={editable} keyboardType="number-pad" onChangeText={value => update({ seed: value === '' ? null : Number(value) })} style={fieldStyle} />
          {(['k_euler_ancestral','k_euler','k_dpmpp_2m'] as const).map(sampler => <ListAction key={sampler} label={`${input.sampler === sampler ? '✓ ' : ''}${sampler}`} secondary disabled={!editable} onPress={() => update({ sampler })} />)}
          {(input.model === 'nai-diffusion-5-curated' ? ['karras'] as const : ['karras','native','exponential'] as const).map(noiseSchedule => <ListAction key={noiseSchedule} label={`${input.noiseSchedule === noiseSchedule ? '✓ ' : ''}${noiseSchedule}`} secondary disabled={!editable} onPress={() => update({ noiseSchedule })} />)}
        </> : null}
        {draft?.state === 'EDITING' ? <CreativeAccountPanel /> : <Text style={{ color: COLORS.text }}>已提交；生成结果会进入本页和资产库。</Text>}
      </> : null}
      <ListAction label="查看任务" secondary disabled={dirty || busy} onPress={() => router.push('/(tabs)/tasks')} />
    </ScrollView>
    <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border }}>
      {draft?.state === 'EDITING' ? <ListAction label={busy ? '处理中…' : dirty ? '保存修改' : '生成 1 张 · 费用待确认'} disabled={busy} onPress={() => void (dirty ? save() : submit())} /> : <ListAction label="返回资产库" onPress={() => router.push('/(tabs)/assets')} />}
    </View>
  </KeyboardAvoidingView>;
}
