import { defaultDraftDependencies, defaultSubmissionDependencies, type CreateFormDraftDependencies, type CreateFormSubmissionDependencies } from './createServices';
export type { CreateFormDraftDependencies, CreateFormSubmissionDependencies } from './createServices';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
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
  const router = useRouter();
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
    catalogReady.current = false;
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
        if (!record) throw new Error('没有可用工作流');
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
    void load();
    return () => { cancelled = true; };
  }, [submissionDependencies.catalog, catalogRevision, draftId, draftDependencies]);
  useEffect(() => {
    if (previousInitialPrompt.current !== initialPrompt) {
      editRevision.current += 1;
      previousInitialPrompt.current = initialPrompt;
    }
    if (initialPrompt) { setPrompt(initialPrompt); setWorkflowValues((current) => ({ ...current, prompt: initialPrompt })); }
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
        if (draft.form) setAudios(draft.form.audios);
        setFieldErrors([]);
        setHandoffNotice(draft.handoff
          ? `已应用提示词助手草稿 · 来源 ${draft.handoff.source.threadId} / ${draft.handoff.source.messageId} · 版本 ${draft.handoff.source.versionId}。请检查参数和素材后手动提交。`
          : '已应用提示词助手草稿，请检查后手动提交。');
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
    const form = { workflowId: definition.id, workflowVersion: definition.version, contentHash: activeRecord?.contentHash, canonicalValues: canonicalInputs(definition, workflowValues), values: { ...workflowValues }, images: [...images], audios: [...audios], revision: editRevision.current };
    formSaveTail.current = formSaveTail.current.catch(() => undefined).then(() => draftDependencies.saveForm!(id, form));
    void formSaveTail.current.catch(error => { if (!cancelled) setHandoffError(`表单保存失败：${error instanceof Error ? error.message : '请重试'}`); });
    return () => { cancelled = true; };
  }, [acknowledgedDraft, appliedDraft, draftId, loadingDraft, definition, activeRecord, workflowValues, images, audios, draftDependencies]);

  const addMedia = async (kind: 'image' | 'audio', source: 'gallery' | 'file' = 'file') => {
    if (!definition || picking || switching || submitting) return;
    editRevision.current += 1;
    setPicking(true);
    try {
      const current = kind === 'image' ? images : audios;
      const picked = await pickTaskMedia(
        kind,
        mediaConstraints(definition, kind === 'image' ? 'images' : 'audios').maximum - current.length,
        source,
        mediaConstraints(definition, kind === 'image' ? 'images' : 'audios').mimes,
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
    setSwitching(true);
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
  const submit = async () => {
    let acquired = false;
    try {
      if (switching || picking || submitting || awaitingDraft) return;
      if (!definition || !activeRecord) throw new Error('工作流尚未加载完成');
      if (loadingDraft || (appliedDraft && acknowledgedDraft !== appliedDraft)) throw new Error('请等待交接素材保存完成');
      if (!submissionGate.tryAcquire()) return;
      acquired = true;
      setSubmitting(true);
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
        Alert.alert('参数设置不合法', validation.summary);
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{definition?.metadata.title ?? '工作流创建'}</Text>
      <Text style={styles.subtitle}>
        {loadError ?? definition?.metadata.description ?? '正在加载本地活动工作流…'}
      </Text>
      <WorkflowSelector definitions={records.map(registryRecordToDefinition)} selectedId={definition?.id} onSelect={id => void selectWorkflow(id)} disabled={submitting || switching || picking || loadingDraft || awaitingDraft || Boolean(appliedDraft && acknowledgedDraft !== appliedDraft)} />
      {alignmentNotices.map((notice, index) => <Text key={index} style={styles.help}>{notice}</Text>)}
      {handoffNotice ? <Text accessibilityLiveRegion="polite" style={styles.help}>{handoffNotice}</Text> : null}
      {loadingDraft ? <Text style={styles.help}>正在读取交接草稿和保存参考图片…</Text> : null}
      {handoffError ? <Text accessibilityRole="alert" style={styles.help}>{handoffError}</Text> : null}
      {handoffError && draftId && <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="重新应用交接草稿" disabled={!definition || loadingDraft} onPress={() => {
          draftStart.current = { id: draftId, revision: editRevision.current };
          appliedIds.current.delete(draftId); consumedIds.current.delete(draftId);
          setAppliedDraft(null); setAcknowledgedDraft(null); setApplyAttempt(value => value + 1);
        }} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={styles.help}>重新应用</Text></Pressable>
        {draftDependencies.discard && <Pressable accessibilityRole="button" accessibilityLabel="丢弃交接草稿" disabled={loadingDraft} onPress={async () => {
          try { await draftDependencies.discard!(draftId); setDiscardedDraft(draftId); setHandoffError(null); setAppliedDraft(null); setAcknowledgedDraft(null); }
          catch (error) { setHandoffError(error instanceof Error ? error.message : '丢弃失败，请重试'); }
        }} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={styles.help}>丢弃草稿</Text></Pressable>}
      </View>}
      {definition ? <WorkflowForm
        definition={{ ...definition, ui: { sections: (definition.ui?.sections ?? [{ id: 'parameters', title: '参数', fields: Object.keys(inputProperties(definition)) }]).map(section => ({ ...section, fields: section.fields.filter(field => field !== imageRules.field && field !== audioRules.field) })).filter(section => section.fields.length) } }}
        value={workflowValues}
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
      <View style={styles.card}>
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
            style={[styles.mediaButton, (images.length >= imageRules.maximum || picking || switching || submitting) && styles.disabled]}
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
            style={[styles.mediaButton, (audios.length >= audioRules.maximum || picking || switching || submitting) && styles.disabled]}
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
          items={images}
          onRemove={(index) => {
            if (submitting || switching) return;
            editRevision.current += 1;
            setImages((items) =>
              items.filter((_, itemIndex) => itemIndex !== index),
            );
          }}
        />
        <AudioPreviewList
          items={audios}
          onRemove={(index) => {
            if (submitting || switching) return;
            editRevision.current += 1;
            setAudios((items) =>
              items.filter((_, itemIndex) => itemIndex !== index),
            );
          }}
        />
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
    </ScrollView>
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
  label: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: SPACING.sm,
  },
  promptBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  promptInput: {
    minHeight: 150,
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 23,
    textAlignVertical: 'top',
  },
  counter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    color: COLORS.textSubtle,
    fontSize: 11,
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
    fontFamily: 'monospace',
  },
  card: {
    backgroundColor: `${COLORS.surface}cc`,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    minWidth: '46%',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  selectedChip: {
    borderColor: COLORS.primaryActive,
    backgroundColor: COLORS.primarySoft,
  },
  chipText: { color: COLORS.textMuted, fontSize: 13 },
  selectedText: { color: '#c7d2fe', fontWeight: '800' },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  step: {
    width: 42,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepText: { color: COLORS.primaryActive, fontSize: 23 },
  durationInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
  },
  rangeHint: { color: COLORS.textSubtle, fontSize: 11, textAlign: 'center' },
  input: {
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: 'monospace',
  },
  mediaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  mediaHeaderCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { color: COLORS.text, fontWeight: '800', fontSize: 16 },
  help: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
  count: { flexShrink: 0, color: COLORS.primaryActive, fontSize: 11, fontFamily: 'monospace', textAlign: 'right' },
  mediaButtons: { flexDirection: 'row', gap: SPACING.sm },
  mediaButton: {
    flex: 1,
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
  mediaText: { color: '#c7d2fe', fontSize: 12, fontWeight: '700' },
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
  submitText: { color: COLORS.onPrimary, fontSize: 16, fontWeight: '800' },
  footnote: {
    color: COLORS.textSubtle,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
});
