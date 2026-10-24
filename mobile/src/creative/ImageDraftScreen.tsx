import { creativeError } from './creativeError';
import { useDraftSync } from './useDraftSync';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { creativeService } from './runtime';
import { novelAiDraftInput, NOVELAI_MODELS, type NovelAiDraftInput } from './novelAiProtocol';
import { prepareCreativeImage, confirmCreativeImage } from './novelAiRuntime';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CreativeResults } from './CreativeResults';
import { DraftHeading } from './DraftHeading';
import { creativeUI as s } from './creativeUI';
import { CreativeAccountPanel } from './CreativeAccountPanel';
import { CopySubmittedDraft } from './CopySubmittedDraft';
import type { CreativeDraft } from './drafts';
import { createId } from '../ids';
import { ListAction } from '../ui/ListPageUI';
import { COLORS } from '../ui/theme';

export function ImageDraftScreen({ id }: { id: string }) {
  const router = useRouter(), navigation = useNavigation();
  const [draft, setDraft] = useState<CreativeDraft>(); const [input, setInput] = useState<NovelAiDraftInput>();
  const [advanced, setAdvanced] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [charactersOpen, setCharactersOpen] = useState(false), [negativeOpen, setNegativeOpen] = useState(false);
  const lock = useRef(false), latest = useRef(input); latest.current = input;
  const dirty = Boolean(input && draft && JSON.stringify(input) !== draft.input_json);
  const editable = draft?.state === 'EDITING' && !busy;
  usePreventRemove(dirty || busy, ({ data }) => {
    if (lock.current) { Alert.alert('操作进行中', '请等待保存或提交完成。'); return; }
    Alert.alert('修改尚未保存', '是否放弃本次未保存修改？', [{ text: '继续编辑', style: 'cancel' }, { text: '放弃并离开', style: 'destructive', onPress: () => navigation.dispatch(data.action) }]);
  });
  const load = async (canApply = () => true) => { const row = await creativeService().draft(id); if (!row) throw new Error('草稿不存在'); const parsed = novelAiDraftInput.parse(JSON.parse(row.input_json)); if (canApply()) { setDraft(row); setInput(parsed); } };
  const { conflict, reload, assertCurrent } = useDraftSync(id, draft, dirty, busy, load, setError);
  useEffect(() => { if (error || conflict) scrollRef.current?.scrollTo({ y: 0, animated: true }); }, [error, conflict]);
  const save = async () => {
    if (lock.current || conflict || !draft || !latest.current || draft.state !== 'EDITING') return;
    lock.current = true; setBusy(true); setError('');
    try { await assertCurrent(); await creativeService().execute({ name: 'draft.updateImage', payload: { id, expectedRevision: draft.revision, input: latest.current } }, createId()); const row = await creativeService().draft(id); if (row) setDraft(row); }
    catch (e) { setError(creativeError(e, '保存失败')); }
    finally { lock.current = false; setBusy(false); }
  };
  useEffect(() => { if (!dirty || busy || error || conflict) return; const timer = setTimeout(() => { void save(); }, 600); return () => clearTimeout(timer); }, [input, draft, dirty, busy, error, conflict]);
  const update = (patch: Partial<NovelAiDraftInput>) => { setInput(old => old ? { ...old, ...patch } : old); setError(''); };
  const submit = async () => {
    if (lock.current || !draft || !latest.current || draft.state !== 'EDITING') return; lock.current = true; setBusy(true); setError('');
    const release = () => { lock.current = false; setBusy(false); };
    try {
      await assertCurrent();
      if (dirty) {
        await creativeService().execute({ name: 'draft.updateImage', payload: { id, expectedRevision: draft.revision, input: latest.current } }, createId());
        const saved = await creativeService().draft(id); if (saved) setDraft(saved);
      }
      const preview = await prepareCreativeImage(id);
      Alert.alert('确认生成 1 张图片', `NovelAI 凭据 ${preview.account.credential_generation_id.slice(-8)}，Seed ${preview.prepared.inputSnapshot.seed}。费用暂不可预估；本次授权 1 次生成，有效期 15 分钟。Opus 不代表所有参数均免费。`, [
        { text: '取消', style: 'cancel', onPress: release },
        { text: '授权并生成', onPress: () => { void confirmCreativeImage(preview).then(() => load()).catch(e => setError(creativeError(e, '提交失败'))).finally(release); } },
      ], { cancelable: false });
    } catch (e) { setError(creativeError(e, '准备失败')); release(); }
  };
  const fieldStyle = { borderWidth: 1, borderColor: COLORS.controlBorder, borderRadius: 8, padding: 12, color: COLORS.text };
  const numberField = (label: string, key: 'width'|'height'|'steps'|'guidance'|'rescale') => <View key={key}><Text style={{ color: COLORS.text }}>{label}</Text><TextInput accessibilityLabel={label} value={String(input![key])} editable={editable} keyboardType="decimal-pad" onChangeText={value => update({ [key]: Number(value) })} style={fieldStyle} /></View>;
  return <SafeAreaView style={s.screen}><KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: COLORS.background }}>
    <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <DraftHeading draft={draft} dirty={dirty} busy={busy} title="图片创作" />
    {conflict ? <View style={s.card}><Text style={s.body}>这份草稿已在其他入口更新。本页输入仍保留，请先处理版本冲突。</Text><ListAction label="载入最新草稿" secondary disabled={busy} onPress={() => Alert.alert('载入最新草稿', '这会放弃本页尚未保存的修改。', [{ text: '保留本页', style: 'cancel' }, { text: '载入最新', onPress: () => void reload().catch(e => setError(e.message)) }])} /></View> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{error}</Text> : null}
      {draft?.state === 'EDITING' ? <CreativeAccountPanel compact /> : null}
      {draft && (draft.target_asset_id || draft.job_id) ? <CreativeResults draft={draft} disabled={busy || dirty} /> : null}
      {draft?.state === 'SUBMITTED' ? <ListAction label={recipeOpen ? '收起生成参数' : '查看本次生成参数'} secondary onPress={() => setRecipeOpen(!recipeOpen)} /> : null}
      {input && (draft?.state === 'EDITING' || recipeOpen) ? <>
        <Text style={s.title}>画面描述</Text>
        <TextInput accessibilityLabel="图片提示词" placeholder="画面、风格与构图" value={input.prompt} onChangeText={prompt => update({ prompt })} editable={editable} multiline style={[fieldStyle, { minHeight: 130, textAlignVertical: 'top' }]} />
        <ListAction label={negativeOpen ? "收起负面描述" : `不希望出现的内容${input.negative ? " · 已填写" : "（可选）"}`} secondary onPress={() => setNegativeOpen(!negativeOpen)} />
        {negativeOpen ? <TextInput accessibilityLabel="图片负面提示词" placeholder="不希望出现的内容" value={input.negative} onChangeText={negative => update({ negative })} editable={editable} multiline style={fieldStyle} /> : null}

        <View style={s.row}>{([{label:'竖图',width:832,height:1216},{label:'方图',width:1024,height:1024},{label:'横图',width:1216,height:832}] as const).map(p => <ListAction key={p.label} label={`${input.width===p.width&&input.height===p.height?'✓ ':''}${p.label}`} secondary disabled={!editable} onPress={() => update({width:p.width,height:p.height})} />)}</View>
        <Text style={s.muted}>{input.width} × {input.height} · 1 张 · {input.model.replace('nai-diffusion-', 'NovelAI ').replace('-curated', ' Curated').replace('-full', ' Full')}</Text>
        <ListAction label={charactersOpen ? '收起角色设置' : `角色 · ${input.characters.length ? `${input.characters.length} 个角色` : '添加角色（可选）'}`} secondary onPress={() => setCharactersOpen(!charactersOpen)} />
        {charactersOpen ? <>
        {input.characters.map((c, index) => <View key={index} style={{ padding: 12, borderWidth: 1, borderColor: COLORS.border, gap: 8 }}>
          <Text style={{ color: COLORS.text }}>角色 {index + 1}</Text>
          <TextInput accessibilityLabel={`角色 ${index + 1} 提示词`} value={c.prompt} editable={editable} multiline onChangeText={prompt => update({ characters: input.characters.map((v,i) => i === index ? { ...v,prompt } : v) })} style={fieldStyle} />
          <TextInput accessibilityLabel={`角色 ${index + 1} 负面`} value={c.negative} editable={editable} multiline onChangeText={negative => update({ characters: input.characters.map((v,i) => i === index ? { ...v,negative } : v) })} style={fieldStyle} />
          {input.useCoordinates ? <View style={{ flexDirection: 'row', gap: 8 }}>{(['x','y'] as const).map(axis => <TextInput key={axis} accessibilityLabel={`角色 ${index+1} ${axis}（0到1）`} value={String(c[axis])} keyboardType="decimal-pad" editable={editable} onChangeText={value => update({ characters: input.characters.map((v,i) => i === index ? { ...v,[axis]: Number(value) } : v) })} style={[fieldStyle,{flex:1}]} />)}</View> : null}
          <ListAction label={`移除角色 ${index+1}`} secondary disabled={!editable} onPress={() => update({ characters: input.characters.filter((_,i) => i !== index) })} />
        </View>)}
        <ListAction label="添加角色（最多 6 个）" secondary disabled={!editable || input.characters.length >= 6} onPress={() => update({ characters: [...input.characters,{ prompt:'', negative:'', x:0.5, y:0.5 }] })} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ color: COLORS.text }}>指定角色位置</Text><Switch accessibilityLabel="指定角色位置" value={input.useCoordinates} disabled={!editable} onValueChange={useCoordinates => update({ useCoordinates })} /></View>
        </> : null}
        <ListAction label={advanced ? '收起高级设置' : '模型与高级设置'} secondary onPress={() => setAdvanced(!advanced)} />
        {advanced ? <>
          {NOVELAI_MODELS.map(model => <ListAction key={model} label={`${input.model === model ? '✓ ' : ''}${model}`} secondary disabled={!editable} onPress={() => update({ model, noiseSchedule: model === 'nai-diffusion-5-curated' ? 'karras' : input.noiseSchedule })} />)}
          {numberField('宽度（64 的倍数）','width')}{numberField('高度（64 的倍数）','height')}{numberField('步数','steps')}{numberField('引导强度','guidance')}{numberField('Rescale','rescale')}
          <TextInput accessibilityLabel="图片 Seed" placeholder="Seed 留空则随机" value={input.seed == null ? '' : String(input.seed)} editable={editable} keyboardType="number-pad" onChangeText={value => update({ seed: value === '' ? null : Number(value) })} style={fieldStyle} />
          {(['k_euler_ancestral','k_euler','k_dpmpp_2m'] as const).map(sampler => <ListAction key={sampler} label={`${input.sampler === sampler ? '✓ ' : ''}${sampler}`} secondary disabled={!editable} onPress={() => update({ sampler })} />)}
          {(input.model === 'nai-diffusion-5-curated' ? ['karras'] as const : ['karras','native','exponential'] as const).map(noiseSchedule => <ListAction key={noiseSchedule} label={`${input.noiseSchedule === noiseSchedule ? '✓ ' : ''}${noiseSchedule}`} secondary disabled={!editable} onPress={() => update({ noiseSchedule })} />)}
        </> : null}

      </> : null}

      {draft?.state==='SUBMITTED'?<CopySubmittedDraft id={id}/>:null}
    </ScrollView>
    <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border }}>
      {draft?.state === 'EDITING' ? <ListAction label={busy ? '处理中…' : '生成 1 张 · 费用待确认'} disabled={busy || conflict} onPress={() => void submit()} /> : <ListAction label="返回资产库" onPress={() => router.push('/(tabs)/assets')} />}
    </View>
  </KeyboardAvoidingView></SafeAreaView>;
}
