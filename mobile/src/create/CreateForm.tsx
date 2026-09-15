import { defaultDraftDependencies, defaultSubmissionDependencies, type CreateFormDraftDependencies, type CreateFormSubmissionDependencies } from './createServices';
export type { CreateFormDraftDependencies, CreateFormSubmissionDependencies } from './createServices';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { TaskMediaInput } from '../media/types';
import { AppIcon } from '../ui/icons';
import { COLORS, SPACING } from '../ui/theme';
import { usePageLayout } from '../ui/adaptiveLayout';
import { AudioPreviewList, ImagePreviewGrid } from './AttachmentPreview';
import { pickTaskMedia } from './MediaPicker';
import { RESOLUTION_OPTIONS } from './resolutions';
import { resolvePromptHandoffValues } from '../handoff/promptHandoff';
import { resolveDraftPrompt } from './draftPrompt';
import { WorkflowForm } from '../workflows/renderer/WorkflowForm';
import type { WorkflowDefinition } from '../workflows/schema/types';
import { createSubmissionGate } from './submissionGate';
import type { RegistryRecord } from '../workflows/registry/types';
import { registryRecordToDefinition } from '../workflows/registry/catalog';
import { buildSubmissionInputSnapshot } from './submissionInput';
import { formatSubmissionFieldError, type SubmissionFieldError, validateSubmissionBeforeQueue } from './submissionValidation';
import { RegistryReleaseError, type RegistryReleaseErrorCode } from '../workflows/registry/releaseManifest';

import { alignWorkflowInputs, canonicalInputs, inputField, inputProperties, mediaConstraints } from '../workflows/inputModel';
import { WorkflowSelector } from '../workflows/renderer/WorkflowSelector';
import { chooseWorkflow, readSelectedWorkflow, saveSelectedWorkflow } from '../workflows/registry/selection';
import { workflowCatalogEvents } from '../workflows/registry/catalogEvents';

const submissionGate = createSubmissionGate();

const SAFE_EXISTING_CATALOG_CODES = new Set<RegistryReleaseErrorCode>([
  'REGISTRY_RELEASE_MANIFEST_INVALID',
  'REGISTRY_RELEASE_DUPLICATE_COORDINATE',
  'REGISTRY_RELEASE_DIGEST_MISMATCH',
  'REGISTRY_RELEASE_ID_REUSED',
  'REGISTRY_IMMUTABLE_VERSION_CONFLICT',
  'REGISTRY_RELEASE_BACKUP_FAILED',
  'REGISTRY_RELEASE_TRANSACTION_ROLLED_BACK',
]);

export function workflowLoadMessage(error: unknown): string {
  if (error instanceof RegistryReleaseError) {
    if (error.code === 'REGISTRY_IMMUTABLE_VERSION_CONFLICT') {
      return '工作流升级校验失败，已保留现有数据。请恢复备份或联系支持。';
    }
    if (error.code === 'REGISTRY_RELEASE_BACKUP_FAILED') {
      return '工作流升级前备份失败，已保留当前版本。';
    }
    if (error.code === 'REGISTRY_STORED_DIGEST_INVALID' || error.code === 'REGISTRY_ACTIVE_POINTER_INVALID') {
      return '工作流数据完整性校验失败，请从完整数据库备份恢复。';
    }
    if (error.code === 'REGISTRY_RELEASE_RECOVERY_REQUIRED') {
      return '工作流升级恢复失败，数据库已进入只读保护模式。';
    }
    return '工作流升级失败，已保留当前版本。';
  }
  return '工作流加载失败';
}

export function CreateForm({
  initialPrompt = '',
  draftId,
  foregroundTick = () => undefined,
  submissionDependencies = defaultSubmissionDependencies,
  draftDependencies = defaultDraftDependencies,
}: {
  initialPrompt?: string;
  draftId?: string;
  foregroundTick?: () => void | Promise<unknown>;
  submissionDependencies?: CreateFormSubmissionDependencies;
  draftDependencies?: CreateFormDraftDependencies;
}) {
  const layout = usePageLayout();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const mediaRef = useRef<View>(null);
  const [incomingPrompt, setIncomingPrompt] = useState('');
  const [undoMedia, setUndoMedia] = useState<{ images: TaskMediaInput[]; audios: TaskMediaInput[] }>();
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [resolution, setResolution] = useState<string>(
    RESOLUTION_OPTIONS[0],
  );
  const [duration, setDuration] = useState('5');
  const [seed, setSeed] = useState('');
  const [images, setImages] = useState<TaskMediaInput[]>([]);
  const [audios, setAudios] = useState<TaskMediaInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [activeRecord, setActiveRecord] = useState<RegistryRecord | null>(null);
  const [workflowValues, setWorkflowValues] = useState<Record<string, unknown>>({ prompt: initialPrompt, resolution: RESOLUTION_OPTIONS[0], duration: 5, seed: '' });
  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [switching, setSwitching] = useState(false);
  const [picking, setPicking] = useState(false);
  const [alignmentNotices, setAlignmentNotices] = useState<string[]>([]);
  const valueCache = useRef(new Map<string, Record<string, unknown>>());
  const liveForm = useRef({ definition, workflowValues });
  liveForm.current = { definition, workflowValues };
  useEffect(() => workflowCatalogEvents.subscribe(() => setCatalogRevision(value => value + 1)), []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SubmissionFieldError[]>([]);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [appliedDraft, setAppliedDraft] = useState<string | null>(null);
  const [acknowledgedDraft, setAcknowledgedDraft] = useState<string | null>(null);
  const [applyAttempt, setApplyAttempt] = useState(0);
  const [discardedDraft, setDiscardedDraft] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftId));
  const draftRoute = useRef(draftId);
  const awaitingDraft = Boolean(draftId && discardedDraft !== draftId && appliedDraft !== draftId && !handoffError);
  useEffect(() => {
    if (draftRoute.current === draftId) return;
    draftRoute.current = draftId;
    if (draftId) { appliedIds.current.delete(draftId); consumedIds.current.delete(draftId); }
    setAppliedDraft(null); setAcknowledgedDraft(null); setHandoffError(null); setHandoffNotice(null);
    setLoadingDraft(Boolean(draftId));
  }, [draftId]);
  const editRevision = useRef(0);
  const previousInitialPrompt = useRef(initialPrompt);
  const draftStart = useRef({ id: draftId, revision: 0 });
  if (draftStart.current.id !== draftId) draftStart.current = { id: draftId, revision: editRevision.current };
  const appliedIds = useRef(new Set<string>());
  const consumedIds = useRef(new Set<string>());
  const formSaveTail = useRef<Promise<void>>(Promise.resolve());
  const catalogReady = useRef(false);
  useEffect(() => {
    let cancelled = false;
    catalogReady.current = false; setCatalogLoading(true);
    const useRecord = (record: RegistryRecord, warning: string | null) => {
      const next = registryRecordToDefinition(record);
      if (cancelled) return;
      catalogReady.current = true;
      setActiveRecord(record);
      setDefinition(next);
      setLoadError(warning);
      const current = liveForm.current;
      const aligned = alignWorkflowInputs(next, current.definition ? canonicalInputs(current.definition, current.workflowValues) : current.workflowValues);
      setWorkflowValues(aligned.values);
      if (current.definition && (current.definition.id !== next.id || current.definition.version !== next.version)) {
        if (!draftId || appliedIds.current.has(draftId)) editRevision.current += 1;
        setAlignmentNotices(['工作流已更新，请核对参数后提交。', ...aligned.notices]);
      }
    };
    const selectRecord = async () => {
      const available = await submissionDependencies.catalog.listActive();
      if (!cancelled) setRecords(available);
      let target: string | undefined;
      if (draftId) {
        const draft = await draftDependencies.read(draftId).catch(() => null);
        target = draft?.form?.workflowId ?? draft?.handoff?.target?.workflowId;
      }
      if (target) {
        const record = available.find(item => item.workflowId === target);
        if (!record) throw new Error('草稿工作流不可用，请在设置中同步工作流后重试');
        return record;
      }
      return chooseWorkflow(available, liveForm.current.definition?.id ?? await readSelectedWorkflow().catch(() => null));
    };
    const load = async () => {
      try {
        await submissionDependencies.catalog.bootstrap();
        const record = await selectRecord();
        if (!record) { if (!cancelled) { setDefinition(null); setActiveRecord(null); setLoadError(null); } return; }
        useRecord(record, null);
      } catch (error) {
        let presentationError = error;
        if (error instanceof RegistryReleaseError && SAFE_EXISTING_CATALOG_CODES.has(error.code)) {
          try {
            const record = await selectRecord();
            if (record) {
              useRecord(record, workflowLoadMessage(error));
              return;
            }
          } catch (fallbackError) {
            presentationError = fallbackError;
          }
        }
        if (!cancelled) {
          setActiveRecord(null);
          setDefinition(null);
          setLoadError(workflowLoadMessage(presentationError));
          setLoadingDraft(false);
        }
      }
    };
    void load().finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [submissionDependencies.catalog, catalogRevision, draftId, draftDependencies]);
  useEffect(() => {
    if (previousInitialPrompt.current === initialPrompt) return;
    previousInitialPrompt.current = initialPrompt;
    if (initialPrompt) setIncomingPrompt(initialPrompt);
  }, [initialPrompt]);
  useEffect(() => {
    if (!draftId || discardedDraft === draftId || appliedIds.current.has(draftId)) { setLoadingDraft(false); return; }
    if (!definition || !catalogReady.current) return;
    let cancelled = false;
    const revision = draftStart.current.revision;
    setHandoffError(null);
    setHandoffNotice(null);
    setLoadingDraft(true);
    const apply = async () => {
      try {
        const draft = await draftDependencies.read(draftId);
        if (cancelled) return;
        if (!draft) throw new Error('草稿已过期或不存在，请返回提示词助手重新导出');
        const targetId = draft.form?.workflowId ?? draft.handoff?.target?.workflowId;
        if (targetId && targetId !== definition.id) return;
        if (!draft.handoff && draft.attachmentIds.length) throw new Error('旧草稿缺少参考图片数据，请返回提示词助手重新添加并导出');
        if (draft.form && draft.form.workflowId !== definition.id) throw new Error('已保存表单对应其他工作流，请切回原工作流');
        const changed = (draft.form?.workflowVersion ?? draft.handoff?.target?.workflowVersion) !== undefined
          && ((draft.form?.workflowVersion ?? draft.handoff?.target?.workflowVersion) !== definition.version || (draft.form?.contentHash ?? draft.handoff?.target?.contentHash) !== activeRecord?.contentHash);
        const source = draft.form?.canonicalValues ?? (draft.form ? canonicalInputs(definition, draft.form.values) : { prompt: draft.prompt, ...draft.handoff?.parameters });
        const realigned = changed ? alignWorkflowInputs(definition, source) : undefined;
        const values = realigned?.values ?? draft.form?.values ?? (draft.handoff ? resolvePromptHandoffValues(draft.handoff, definition) : { [inputField(definition, 'prompt')]: resolveDraftPrompt(prompt, draft.prompt) });
        if (realigned) setAlignmentNotices(['草稿的工作流版本已变化，已重新对齐，请核对参数后提交。', ...realigned.notices]);
        const importedImages = draft.form?.images ?? (draft.handoff ? await draftDependencies.materialize(draft.handoff) : []);
        if (cancelled || appliedIds.current.has(draftId)) return;
        if (editRevision.current !== revision) throw new Error('创建表单已修改，草稿已保留；请重新打开创建页应用');
        editRevision.current = Math.max(editRevision.current, draft.form?.revision ?? 0) + (changed ? 1 : 0);
        appliedIds.current.add(draftId);
        setWorkflowValues((current) => ({ ...current, ...values }));
        setPrompt(String(values[inputField(definition, 'prompt')] ?? ''));
        if (values.resolution !== undefined) setResolution(String(values.resolution));
        if (values.duration !== undefined) setDuration(String(values.duration));
        if (values.seed !== undefined) setSeed(String(values.seed));
        setImages(importedImages);
        if (draft.form) { setAudios(draft.form.audios); setUndoMedia(draft.form.undoMedia); }
        setFieldErrors([]);
        setHandoffNotice('提示词与参考素材已带入，请核对后生成。');
        setAppliedDraft(draftId);
      } catch (error) {
        if (!cancelled) setHandoffError(`交接未应用：${error instanceof Error ? error.message : '读取草稿失败'}。草稿已保留。`);
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    };
    void apply();
    return () => { cancelled = true; };
  }, [draftId, definition, draftDependencies, applyAttempt, discardedDraft]);
  // A committed render acknowledges form ownership; the durable draft remains recoverable.
  useEffect(() => {
    if (!appliedDraft || appliedDraft !== draftId || consumedIds.current.has(appliedDraft)) return;
    consumedIds.current.add(appliedDraft);
    let cancelled = false;
    void draftDependencies.consume(appliedDraft).then(draft => {
      if (!draft) throw new Error('交接草稿不存在');
      if (!cancelled) setAcknowledgedDraft(appliedDraft);
    }).catch(() => {
      consumedIds.current.delete(appliedDraft);
      if (!cancelled) setHandoffError('表单已应用，但素材接管保存失败；草稿仍保留，请重新应用。');
    });
    return () => { cancelled = true; };
  }, [appliedDraft, draftId, draftDependencies]);
  useEffect(() => {
    if (!acknowledgedDraft || acknowledgedDraft !== draftId || appliedDraft !== draftId || loadingDraft || !definition || !draftDependencies.saveForm) return;
    let cancelled = false;
    const id = acknowledgedDraft;
    const form = { workflowId: definition.id, workflowVersion: definition.version, contentHash: activeRecord?.contentHash, canonicalValues: canonicalInputs(definition, workflowValues), values: { ...workflowValues }, images: [...images], audios: [...audios], undoMedia, revision: editRevision.current };
    formSaveTail.current = formSaveTail.current.catch(() => undefined).then(() => draftDependencies.saveForm!(id, form));
    void formSaveTail.current.catch(error => { if (!cancelled) setHandoffError(`表单保存失败：${error instanceof Error ? error.message : '请重试'}`); });
    return () => { cancelled = true; };
  }, [acknowledgedDraft, appliedDraft, draftId, loadingDraft, definition, activeRecord, workflowValues, images, audios, undoMedia, draftDependencies]);

  const addMedia = async (kind: 'image' | 'audio', source: 'gallery' | 'file' = 'file') => {
    if (!definition || picking || switching || submitting) return;
    editRevision.current += 1;
    setPicking(true); setUndoMedia(undefined);
    try {
      const current = kind === 'image' ? images : audios;
      const picked = await pickTaskMedia(
        kind,
        mediaConstraints(definition, kind === 'image' ? 'images' : 'audios').maximum - current.length,
        source,
        mediaConstraints(definition, kind === 'image' ? 'images' : 'audios').mimes,
        skipped => Alert.alert(`已跳过 ${skipped.length} 个素材`, skipped.join('\n')),
        50 * 1024 * 1024 - [...images, ...audios].reduce((sum, item) => sum + (item.size ?? 0), 0),
      );
      if (kind === 'image') setImages((items) => [...items, ...picked]);
      else setAudios((items) => [...items, ...picked]);
    } catch (error) {
      Alert.alert(
        '素材不可用',
        error instanceof Error ? error.message : '读取素材失败',
      );
    } finally { setPicking(false); }
  };
  const addImage = () => {
    Alert.alert('添加参考图片', '选择图片来源', [
      { text: '从相册选择', onPress: () => void addMedia('image', 'gallery') },
      { text: '从文件选择', onPress: () => void addMedia('image', 'file') },
      { text: '取消', style: 'cancel' },
    ]);
  };
  const selectWorkflow = async (id: string) => {
    if (switching || submitting || picking || loadingDraft || awaitingDraft || id === definition?.id) return;
    const record = records.find(item => item.workflowId === id);
    if (!record || !definition) return;
    setSwitching(true); setUndoMedia(undefined);
    try {
      await formSaveTail.current;
      const latest = canonicalInputs(definition, liveForm.current.workflowValues);
      valueCache.current.set(definition.id, latest);
      const next = registryRecordToDefinition(record);
      const aligned = alignWorkflowInputs(next, { ...(valueCache.current.get(id) ?? latest), prompt: latest.prompt });
      editRevision.current += 1;
      setDefinition(next); setActiveRecord(record); setWorkflowValues(aligned.values);
      setFieldErrors([]); setAlignmentNotices(aligned.notices);
      await saveSelectedWorkflow(id).catch(() => undefined);
    } catch (error) { Alert.alert('切换失败', error instanceof Error ? error.message : '请重试'); }
    finally { setSwitching(false); }
  };
  const imageRules = definition ? mediaConstraints(definition, 'images') : { minimum: 0, maximum: 9, field: 'images', mimes: [] };
  const audioRules = definition ? mediaConstraints(definition, 'audios') : { minimum: 0, maximum: 3, field: 'audios', mimes: [] };
  useEffect(() => {
    if (!definition || !activeRecord) return;
    const inputs = buildSubmissionInputSnapshot({ definition, workflowValues, fallback: { prompt, resolution, duration, seed }, images, audios });
    const checked = validateSubmissionBeforeQueue({ definition, loaded: activeRecord, active: activeRecord, inputs });
    setFieldErrors(current => current.filter(error => ![imageRules.field, audioRules.field].includes(error.field ?? '') || (!checked.ok && checked.fieldErrors.some(next => next.path === error.path))));
  }, [images, audios]);
  const submit = async () => {
    let acquired = false;
    try {
      if (switching || picking || submitting || awaitingDraft) return;
      if (!definition || !activeRecord) throw new Error('工作流尚未加载完成');
      if (loadingDraft || (appliedDraft && acknowledgedDraft !== appliedDraft)) throw new Error('请等待交接素材保存完成');
      if (!submissionGate.tryAcquire()) return;
      acquired = true;
      setSubmitting(true); setUndoMedia(undefined);
      await formSaveTail.current;
      const inputSnapshot = buildSubmissionInputSnapshot({
        definition,
        workflowValues,
        fallback: { prompt, resolution, duration, seed },
        images,
        audios,
      });
      const currentActive = await submissionDependencies.catalog.getActive(definition.id);
      const validation = validateSubmissionBeforeQueue({ definition, loaded: activeRecord, active: currentActive, inputs: inputSnapshot });
      if (!validation.ok) {
        setFieldErrors(validation.fieldErrors);
        if (scrollRef.current && [imageRules.field, audioRules.field].includes(validation.fieldErrors[0]?.field ?? '')) mediaRef.current?.measureLayout?.(scrollRef.current.getInnerViewNode(), (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true }), () => undefined);
        if (!validation.fieldErrors.some(error => error.field)) Alert.alert('参数设置不合法', validation.summary);
        return;
      }
      setFieldErrors([]);
      const settings = await submissionDependencies.readSettings();
      if (!settings.token) throw new Error('请先在设置中保存 AutoDL Token');
      const task = await submissionDependencies.queue({ definition, activeRecord, inputSnapshot, images, audios, token: settings.token, foregroundTick, ...(acknowledgedDraft ? { handoffId: acknowledgedDraft } : {}) });
      if (acknowledgedDraft) {
        setImages([]); setAudios([]);
        setWorkflowValues(current => ({ ...current, [inputField(definition, 'images')]: [], [inputField(definition, 'audios')]: [] }));
        setDiscardedDraft(draftId ?? null);
      }
      setAcknowledgedDraft(null); setAppliedDraft(null);
      Alert.alert('提交成功', `任务 ${task.id} 已加入队列`, [
        { text: '留在此页', style: 'cancel' },
        { text: '查看任务', onPress: () => router.navigate('/(tabs)/tasks') },
      ]);
    } catch (error) {
      Alert.alert(
        '提交失败',
        error instanceof Error ? error.message : '未知错误',
      );
    } finally {
      if (acquired) { submissionGate.release(); setSubmitting(false); }
    }
  };
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView ref={scrollRef}
      style={styles.container}
      contentContainerStyle={[styles.content, layout.contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {incomingPrompt ? <View style={styles.card}><Text>收到新的提示词，请选择如何带入。当前编辑内容已保留。</Text>{(['替换','追加','取消'] as const).map(action => <Pressable key={action} accessibilityRole="button" disabled={submitting || switching} style={styles.mediaButton} onPress={() => { if (action !== '取消') { const field = definition ? inputField(definition, 'prompt') : 'prompt'; setWorkflowValues(current => ({ ...current, [field]: action === '追加' ? [String(current[field] ?? ''), incomingPrompt].filter(Boolean).join('\n') : incomingPrompt })); editRevision.current++; } setIncomingPrompt(''); }}><Text>{action}</Text></Pressable>)}</View> : null}
      {catalogLoading ? <ActivityIndicator accessibilityLabel="正在加载工作流" /> : !definition && !loadError ? <Pressable accessibilityRole="button" onPress={() => router.navigate('/(tabs)/settings')} style={styles.mediaButton}><Text>暂无工作流，前往设置同步</Text></Pressable> : null}
      <Text style={styles.title}>{definition?.metadata.title ?? '工作流创建'}</Text>
      <Text style={styles.subtitle}>
        {loadError ?? definition?.metadata.description ?? '正在加载本地活动工作流…'}
      </Text>
      {loadError ? <Pressable accessibilityRole="button" accessibilityLabel="重试加载工作流" onPress={() => setCatalogRevision(value => value + 1)} style={styles.mediaButton}><Text style={styles.mediaText}>重试加载工作流</Text></Pressable> : null}
      {submitting || switching ? <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator /><Text style={styles.help}>{submitting ? '正在提交，参数暂时锁定…' : '正在切换工作流…'}</Text></View> : null}
      <WorkflowSelector definitions={records.map(registryRecordToDefinition)} selectedId={definition?.id} onSelect={id => void selectWorkflow(id)} disabled={submitting || switching || picking || loadingDraft || awaitingDraft || Boolean(appliedDraft && acknowledgedDraft !== appliedDraft)} />
      {alignmentNotices.map((notice, index) => <Text key={index} style={styles.help}>{notice}</Text>)}
      {handoffNotice ? <Text accessibilityLiveRegion="polite" style={styles.help}>{handoffNotice}</Text> : null}
      {loadingDraft ? <Text style={styles.help}>正在读取交接草稿和保存参考图片…</Text> : null}
      {handoffError ? <Text accessibilityRole="alert" style={styles.help}>{handoffError}</Text> : null}
      {handoffError && draftId && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="重新应用交接草稿" disabled={!definition || loadingDraft} onPress={() => {
          draftStart.current = { id: draftId, revision: editRevision.current };
          appliedIds.current.delete(draftId); consumedIds.current.delete(draftId);
          setAppliedDraft(null); setAcknowledgedDraft(null); setApplyAttempt(value => value + 1);
        }} style={styles.mediaButton}><Text style={styles.help}>重新应用</Text></Pressable>
        {draftDependencies.discard && <Pressable accessibilityRole="button" accessibilityLabel="丢弃交接草稿" disabled={loadingDraft} onPress={() => Alert.alert('丢弃交接草稿？', '草稿丢弃后无法恢复。', [{ text: '保留', style: 'cancel' }, { text: '丢弃草稿', style: 'destructive', onPress: async () => {
          try { await draftDependencies.discard!(draftId); setDiscardedDraft(draftId); setHandoffError(null); setAppliedDraft(null); setAcknowledgedDraft(null); }
          catch (error) { setHandoffError(error instanceof Error ? error.message : '丢弃失败，请重试'); }
        } }])} style={styles.mediaButton}><Text style={styles.help}>丢弃草稿</Text></Pressable>}
      </View>}
      {definition ? <WorkflowForm
        definition={{ ...definition, ui: { sections: (definition.ui?.sections ?? [{ id: 'parameters', title: '参数', fields: Object.keys(inputProperties(definition)) }]).map(section => ({ ...section, fields: section.fields.filter(field => field !== imageRules.field && field !== audioRules.field) })).filter(section => section.fields.length) } }}
        scrollRef={scrollRef}
        value={workflowValues}
        disabled={submitting || switching}
        errors={fieldErrors.filter((error) => error.field).map((error) => ({ path: error.field!, message: formatSubmissionFieldError(error, definition) }))}
        onChange={(next) => {
          if (submitting || switching) return;
          editRevision.current += 1;
          setFieldErrors((current) => current.filter((error) => !error.field || Object.is(next[error.field], workflowValues[error.field])));
          setWorkflowValues(next);
          setPrompt(String(next.prompt ?? ''));
          setResolution(String(next.resolution ?? RESOLUTION_OPTIONS[0]));
          setDuration(String(next.duration ?? 5));
          setSeed(String(next.seed ?? ''));
        }}
      /> : null}
      <View ref={mediaRef} style={styles.card}>
        <View style={styles.mediaHeader}>
          <View style={styles.mediaHeaderCopy}>
            <Text style={styles.sectionTitle}>参考素材</Text>
            <Text style={styles.help}>
              支持最多 {imageRules.maximum} 张图片及 {audioRules.maximum} 段音频（单个及全部素材总计均不超过 50MB）
              {imageRules.minimum > 0 ? `；至少需要 ${imageRules.minimum} 张参考图` : ''}
            </Text>
          </View>
          <Text style={styles.count}>
            图 {images.length}/{imageRules.maximum} · 音 {audios.length}/{audioRules.maximum}
          </Text>
        </View>
        <View style={styles.mediaButtons}>
          <Pressable
            disabled={images.length >= imageRules.maximum || picking || switching || submitting}
            onPress={addImage}
            style={[styles.mediaButton, styles.mediaRowButton, (images.length >= imageRules.maximum || picking || switching || submitting) && styles.disabled]}
          >
            <AppIcon
              name="add_photo_alternate"
              size={18}
              color={COLORS.primaryActive}
            />
            <Text style={styles.mediaText}>添加参考图片</Text>
          </Pressable>
          <Pressable
            disabled={audios.length >= audioRules.maximum || picking || switching || submitting}
            onPress={() => void addMedia('audio')}
            style={[styles.mediaButton, styles.mediaRowButton, (audios.length >= audioRules.maximum || picking || switching || submitting) && styles.disabled]}
          >
            <AppIcon
              name="library_music"
              size={18}
              color={COLORS.primaryActive}
            />
            <Text style={styles.mediaText}>添加参考音频</Text>
          </Pressable>
        </View>
        <ImagePreviewGrid
          disabled={submitting || switching}
          items={images}
          onRemove={(index) => {
            if (submitting || switching) return;
            setUndoMedia({ images, audios });
            editRevision.current += 1;
            setImages((items) =>
              items.filter((_, itemIndex) => itemIndex !== index),
            );
          }}
        />
        <AudioPreviewList
          disabled={submitting || switching}
          items={audios}
          onRemove={(index) => {
            if (submitting || switching) return;
            setUndoMedia({ images, audios });
            editRevision.current += 1;
            setAudios((items) =>
              items.filter((_, itemIndex) => itemIndex !== index),
            );
          }}
        />
        {undoMedia ? <Pressable accessibilityRole="button" disabled={submitting || switching} style={styles.mediaButton} onPress={() => { setImages(undoMedia.images); setAudios(undoMedia.audios); setUndoMedia(undefined); editRevision.current++; }}><Text>撤销上次素材删除</Text></Pressable> : null}
        {images.length >= imageRules.maximum ? <Text>参考图片已达上限，请先删除再添加</Text> : null}
        {audios.length >= audioRules.maximum ? <Text>参考音频已达上限，请先删除再添加</Text> : null}
        <Text style={styles.help}>音频格式：{audioRules.mimes.map(mime => mime.replace('audio/', '')).join(' / ')}</Text>
        {definition && fieldErrors.filter(error => error.path.startsWith(`/${imageRules.field}`) || error.path.startsWith(`/${audioRules.field}`)).map((error, index) => <Text key={index} accessibilityRole="alert" style={{ color: COLORS.danger }}>{formatSubmissionFieldError(error, definition)}</Text>)}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="提交 AutoDL 任务生成"
        disabled={submitting || switching || picking || loadingDraft || awaitingDraft || Boolean(appliedDraft && acknowledgedDraft !== appliedDraft) || !definition || !activeRecord}
        onPress={() => void submit()}
        style={[styles.submit, (submitting || loadingDraft || Boolean(appliedDraft && acknowledgedDraft !== appliedDraft) || !definition || !activeRecord) && styles.disabled]}
      >
        <AppIcon name="bolt" size={20} color={COLORS.text} />
        <Text style={styles.submitText}>
          {submitting ? '提交中…' : '提交 AutoDL 任务生成'}
        </Text>
      </Pressable>
      <Text style={styles.footnote}>
        提交后保存至任务队列，成功后自动下载 MP4 至本地。
      </Text>
    </ScrollView></KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.xl, paddingBottom: 140, gap: SPACING.lg },
  title: {
    color: COLORS.text,
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subtitle: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21 },
  card: {
    backgroundColor: `${COLORS.surface}cc`,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  mediaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  mediaHeaderCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { color: COLORS.text, fontWeight: '800', fontSize: 16 },
  help: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  count: { flexShrink: 0, color: COLORS.primaryActive, fontSize: 13, fontFamily: 'monospace', textAlign: 'right' },
  mediaButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  mediaRowButton: { flexGrow: 1, flexBasis: 140 },
  mediaButton: {
    padding: 12,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366f155',
    backgroundColor: '#312e811c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mediaText: { flexShrink: 1, color: '#c7d2fe', fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  submit: {
    minHeight: 56,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  submitText: { flexShrink: 1, textAlign: 'center', color: COLORS.onPrimary, fontSize: 16, fontWeight: '800' },
  footnote: {
    color: COLORS.textSubtle,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 17,
    textAlign: 'center',
  },
});
