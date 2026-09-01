import { useEffect, useState } from 'react';
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
import { getDatabase } from '../storage/databaseClient';
import { readSettings } from '../settings/storage';
import { createTaskRepository } from '../tasks/repository';
import type { TaskMediaInput } from '../tasks/types';
import { AppIcon } from '../ui/icons';
import { COLORS, SPACING } from '../ui/theme';
import { AudioPreviewList, ImagePreviewGrid } from './AttachmentPreview';
import { pickTaskMedia } from './MediaPicker';
import { RESOLUTION_OPTIONS, type Resolution } from './resolutions';
import { createPromptDraftStore } from '../agent/promptDraft';
import { resolveDraftPrompt } from './draftPrompt';
import { WorkflowForm } from '../workflows/renderer/WorkflowForm';
import type { WorkflowDefinition } from '../workflows/schema/types';
import { createJobRepository } from '../jobs/repository';
import { jobToTaskProjection } from '../tasks/projection';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';
import { createSubmissionGate } from './submissionGate';
import { createAppWorkflowCatalog } from '../workflows/registry/builtin';
import type { RegistryRecord } from '../workflows/registry/types';
import { registryRecordToDefinition } from '../workflows/registry/catalog';

const database = getDatabase();
const taskStore = createTaskRepository(database);
const jobStore = createJobRepository(database);
const submissionGate = createSubmissionGate();

const promptDraftStore = createPromptDraftStore(
  database,
);
const workflowCatalog = createAppWorkflowCatalog();

export function CreateForm({
  initialPrompt = '',
  draftId,
}: {
  initialPrompt?: string;
  draftId?: string;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [resolution, setResolution] = useState<Resolution>(
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
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => { let cancelled = false; void workflowCatalog.bootstrap().then(() => workflowCatalog.listActive()).then((records) => { const record = records[0]; if (!record) throw new Error('没有可用工作流'); const next = registryRecordToDefinition(record); if (!cancelled) { setActiveRecord(record); setDefinition(next); const properties = (next.inputs.properties ?? {}) as Record<string, { default?: unknown }>; setWorkflowValues((current) => Object.fromEntries(Object.entries(properties).map(([key, schema]) => [key, current[key] ?? schema.default]))); } }).catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : '工作流加载失败'); }); return () => { cancelled = true; }; }, []);
  useEffect(() => {
    if (initialPrompt) { setPrompt(initialPrompt); setWorkflowValues((current) => ({ ...current, prompt: initialPrompt })); }
  }, [initialPrompt]);
  useEffect(() => {
    if (!draftId) return;
    void promptDraftStore.consume(draftId).then((draft) => {
      if (draft)
        setPrompt((current) => {
          const next = resolveDraftPrompt(current, draft.prompt);
          setWorkflowValues((values) => ({ ...values, prompt: next }));
          return next;
        });
    });
  }, [draftId]);

  const addMedia = async (kind: 'image' | 'audio', source: 'gallery' | 'file' = 'file') => {
    try {
      const current = kind === 'image' ? images : audios;
      const picked = await pickTaskMedia(
        kind,
        (kind === 'image' ? 9 : 3) - current.length,
        source,
      );
      if (kind === 'image') setImages((items) => [...items, ...picked]);
      else setAudios((items) => [...items, ...picked]);
    } catch (error) {
      Alert.alert(
        '素材不可用',
        error instanceof Error ? error.message : '读取素材失败',
      );
    }
  };
  const addImage = () => {
    Alert.alert('添加参考图片', '选择图片来源', [
      { text: '从相册选择', onPress: () => void addMedia('image', 'gallery') },
      { text: '从文件选择', onPress: () => void addMedia('image', 'file') },
      { text: '取消', style: 'cancel' },
    ]);
  };
  const submit = async () => {
    if (!String(workflowValues.prompt ?? prompt).trim()) {
      Alert.alert('提示', '请输入 Prompt 描述');
      return;
    }
    if (!submissionGate.tryAcquire()) return;
    setSubmitting(true);
    try {
      if (!definition || !activeRecord) throw new Error('工作流尚未加载完成');
      const settings = await readSettings();
      if (!settings.token) throw new Error('请先在设置中保存 AutoDL Token');
      const inputSnapshot: Record<string, unknown> = { ...workflowValues, images, audios };
      if ('prompt' in workflowValues) inputSnapshot.prompt = String(workflowValues.prompt ?? prompt).trim();
      if ('resolution' in workflowValues) inputSnapshot.resolution = String(workflowValues.resolution ?? resolution) as Resolution;
      if ('duration' in workflowValues) inputSnapshot.duration = Number(workflowValues.duration ?? duration) || 0;
      if ('seed' in workflowValues) inputSnapshot.seed = String(workflowValues.seed ?? seed).trim() || undefined;
      const adapters = createBuiltinProviderAdapters({ resolveCredential: (kind) => kind === 'autodl-token' ? settings.token : undefined });
      const runtime = createWorkflowRuntime({ adapters, jobs: jobStore, credentials: { get: async () => ({ ok: true }) }, id: () => `job-${Date.now()}-${Math.random().toString(16).slice(2)}` });
      const currentActive = await workflowCatalog.getActive(definition.id);
      if (!currentActive || currentActive.contentHash !== activeRecord.contentHash) throw new Error('工作流已更新，请重新打开创建页');
      const job = await runtime.submit(definition, { workflowId: definition.id, workflowVersion: definition.version, contentHash: activeRecord.contentHash, inputs: inputSnapshot, source: 'user', status: 'ready' });
      const task = { ...jobToTaskProjection(job, []), images, audios };
      await taskStore.upsert(task);
      Alert.alert('提交成功', `任务 ${task.id} 已加入队列`, [
        { text: '查看任务', onPress: () => router.navigate('/(tabs)/tasks') },
      ]);
    } catch (error) {
      Alert.alert(
        '提交失败',
        error instanceof Error ? error.message : '未知错误',
      );
    } finally {
      submissionGate.release();
      setSubmitting(false);
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
      {definition ? <WorkflowForm
        definition={{ ...definition, ui: { sections: (definition.ui?.sections ?? []).slice(0, 2) } }}
        value={workflowValues}
        onChange={(next) => {
          setWorkflowValues(next);
          setPrompt(String(next.prompt ?? ''));
          setResolution(String(next.resolution ?? RESOLUTION_OPTIONS[0]) as Resolution);
          setDuration(String(next.duration ?? 5));
          setSeed(String(next.seed ?? ''));
        }}
      /> : null}
      <View style={styles.card}>
        <View style={styles.mediaHeader}>
          <View style={styles.mediaHeaderCopy}>
            <Text style={styles.sectionTitle}>参考素材</Text>
            <Text style={styles.help}>
              支持最多 9 张图片及 3 段音频（单个及全部素材总计均不超过 50MB）
            </Text>
          </View>
          <Text style={styles.count}>
            图 {images.length}/9 · 音 {audios.length}/3
          </Text>
        </View>
        <View style={styles.mediaButtons}>
          <Pressable
            disabled={images.length >= 9}
            onPress={addImage}
            style={[styles.mediaButton, images.length >= 9 && styles.disabled]}
          >
            <AppIcon
              name="add_photo_alternate"
              size={18}
              color={COLORS.primaryActive}
            />
            <Text style={styles.mediaText}>添加参考图片</Text>
          </Pressable>
          <Pressable
            disabled={audios.length >= 3}
            onPress={() => void addMedia('audio')}
            style={[styles.mediaButton, audios.length >= 3 && styles.disabled]}
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
          onRemove={(index) =>
            setImages((items) =>
              items.filter((_, itemIndex) => itemIndex !== index),
            )
          }
        />
        <AudioPreviewList
          items={audios}
          onRemove={(index) =>
            setAudios((items) =>
              items.filter((_, itemIndex) => itemIndex !== index),
            )
          }
        />
      </View>
      <Pressable
        disabled={submitting}
        onPress={() => void submit()}
        style={[styles.submit, submitting && styles.disabled]}
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
  submitText: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  footnote: {
    color: COLORS.textSubtle,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
});
