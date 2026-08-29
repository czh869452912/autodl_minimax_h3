import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { openDatabaseSync } from 'expo-sqlite';
import { readSettings } from '../settings/storage';
import { submitTask } from '../tasks/api';
import { createTaskRepository } from '../tasks/repository';
import type { TaskMediaInput } from '../tasks/types';
import { AppIcon } from '../ui/icons';
import { COLORS, SPACING } from '../ui/theme';
import { AudioPreviewList, ImagePreviewGrid } from './AttachmentPreview';
import { pickTaskMedia } from './MediaPicker';
import { RESOLUTION_OPTIONS, type Resolution } from './resolutions';
import { createPromptDraftStore } from '../agent/promptDraft';
import { resolveDraftPrompt } from './draftPrompt';

const taskStore = createTaskRepository(openDatabaseSync('autodl-h3.db'));

const promptDraftStore = createPromptDraftStore(openDatabaseSync('autodl-h3.db'));

export function CreateForm({ initialPrompt = '', draftId }: { initialPrompt?: string; draftId?: string }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [resolution, setResolution] = useState<Resolution>(RESOLUTION_OPTIONS[0]);
  const [duration, setDuration] = useState('5');
  const [seed, setSeed] = useState('');
  const [images, setImages] = useState<TaskMediaInput[]>([]);
  const [audios, setAudios] = useState<TaskMediaInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { if (initialPrompt) setPrompt(initialPrompt); }, [initialPrompt]);
  useEffect(() => {
    if (!draftId) return;
    void promptDraftStore.consume(draftId).then((draft) => { if (draft) setPrompt((current) => resolveDraftPrompt(current, draft.prompt)); });
  }, [draftId]);

  const addMedia = async (kind: 'image' | 'audio') => {
    try {
      const current = kind === 'image' ? images : audios;
      const picked = await pickTaskMedia(kind, (kind === 'image' ? 9 : 3) - current.length);
      if (kind === 'image') setImages((items) => [...items, ...picked]); else setAudios((items) => [...items, ...picked]);
    } catch (error) { Alert.alert('素材不可用', error instanceof Error ? error.message : '读取素材失败'); }
  };
  const submit = async () => {
    if (!prompt.trim()) { Alert.alert('提示', '请输入 Prompt 描述'); return; }
    setSubmitting(true);
    try {
      const settings = await readSettings();
      if (!settings.token) throw new Error('请先在设置中保存 AutoDL Token');
      const task = await submitTask(settings.token, { prompt: prompt.trim(), resolution, duration: Math.max(1, Math.min(15, Number(duration) || 5)), seed: seed.trim() || undefined, images, audios });
      await taskStore.upsert(task);
      Alert.alert('提交成功', `任务 ${task.id} 已加入队列`, [{ text: '查看任务', onPress: () => router.navigate('/(tabs)/tasks') }]);
    } catch (error) { Alert.alert('提交失败', error instanceof Error ? error.message : '未知错误'); } finally { setSubmitting(false); }
  };
  return <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>AutoDL H3 视频生成</Text><Text style={styles.subtitle}>多图与多音频参考生视频 · minimax_h3_image_audio_to_video_v2_15s 工作流</Text>
    <Text style={styles.label}>Prompt（视频描述）</Text><View style={styles.promptBox}><TextInput multiline value={prompt} onChangeText={setPrompt} placeholder="描述你想生成的视频：主体、动作、场景、镜头运动、光影与音效..." placeholderTextColor={COLORS.textSubtle} style={styles.promptInput} /><Text style={styles.counter}>{prompt.length} 字符</Text></View>
    <View style={styles.card}><Text style={styles.label}>分辨率（Resolution）</Text><View style={styles.chips}>{RESOLUTION_OPTIONS.map((item) => <Pressable key={item} onPress={() => setResolution(item)} style={[styles.chip, resolution === item && styles.selectedChip]}><Text style={[styles.chipText, resolution === item && styles.selectedText]}>{item}</Text></Pressable>)}</View></View>
    <View style={styles.card}><Text style={styles.label}>视频时长（Duration）</Text><View style={styles.durationRow}><Pressable onPress={() => setDuration(String(Math.max(1, Number(duration || 5) - 1)))} style={styles.step}><Text style={styles.stepText}>−</Text></Pressable><TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" style={styles.durationInput} /><Pressable onPress={() => setDuration(String(Math.min(15, Number(duration || 5) + 1)))} style={styles.step}><Text style={styles.stepText}>＋</Text></Pressable></View><Text style={styles.rangeHint}>1–15 秒</Text><Text style={[styles.label, { marginTop: SPACING.md }]}>随机种子 Seed（可选）</Text><TextInput value={seed} onChangeText={setSeed} keyboardType="number-pad" placeholder="如 123456（留空则随机）" placeholderTextColor={COLORS.textSubtle} style={styles.input} /></View>
    <View style={styles.card}><View style={styles.mediaHeader}><View><Text style={styles.sectionTitle}>参考素材</Text><Text style={styles.help}>支持最多 9 张图片及 3 段音频（单个 50MB）</Text></View><Text style={styles.count}>图 {images.length}/9 · 音 {audios.length}/3</Text></View><View style={styles.mediaButtons}><Pressable disabled={images.length >= 9} onPress={() => void addMedia('image')} style={[styles.mediaButton, images.length >= 9 && styles.disabled]}><AppIcon name="add_photo_alternate" size={18} color={COLORS.primaryActive} /><Text style={styles.mediaText}>添加参考图片</Text></Pressable><Pressable disabled={audios.length >= 3} onPress={() => void addMedia('audio')} style={[styles.mediaButton, audios.length >= 3 && styles.disabled]}><AppIcon name="library_music" size={18} color={COLORS.primaryActive} /><Text style={styles.mediaText}>添加参考音频</Text></Pressable></View><ImagePreviewGrid items={images} onRemove={(index) => setImages((items) => items.filter((_, itemIndex) => itemIndex !== index))} /><AudioPreviewList items={audios} onRemove={(index) => setAudios((items) => items.filter((_, itemIndex) => itemIndex !== index))} /></View>
    <Pressable disabled={submitting} onPress={() => void submit()} style={[styles.submit, submitting && styles.disabled]}><AppIcon name="bolt" size={20} color={COLORS.text} /><Text style={styles.submitText}>{submitting ? '提交中…' : '提交 AutoDL 任务生成'}</Text></Pressable><Text style={styles.footnote}>提交后保存至任务队列，成功后自动下载 MP4 至本地。</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: COLORS.background }, content: { padding: SPACING.xl, paddingBottom: 140, gap: SPACING.lg }, title: { color: COLORS.text, fontSize: 29, fontWeight: '800', letterSpacing: -0.6 }, subtitle: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21 }, label: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginBottom: SPACING.sm }, promptBox: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md }, promptInput: { minHeight: 150, color: COLORS.text, fontSize: 15, lineHeight: 23, textAlignVertical: 'top' }, counter: { borderTopWidth: 1, borderTopColor: COLORS.border, color: COLORS.textSubtle, fontSize: 11, paddingTop: SPACING.sm, marginTop: SPACING.sm, fontFamily: 'monospace' }, card: { backgroundColor: `${COLORS.surface}cc`, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: SPACING.lg, gap: SPACING.sm }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }, chip: { minWidth: '46%', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', backgroundColor: COLORS.surfaceRaised, borderWidth: 1, borderColor: COLORS.border }, selectedChip: { borderColor: COLORS.primaryActive, backgroundColor: COLORS.primarySoft }, chipText: { color: COLORS.textMuted, fontSize: 13 }, selectedText: { color: '#c7d2fe', fontWeight: '800' }, durationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }, step: { width: 42, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceRaised, borderWidth: 1, borderColor: COLORS.border }, stepText: { color: COLORS.primaryActive, fontSize: 23 }, durationInput: { flex: 1, height: 44, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, textAlign: 'center', fontSize: 17, fontWeight: '800' }, rangeHint: { color: COLORS.textSubtle, fontSize: 11, textAlign: 'center' }, input: { color: COLORS.text, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontFamily: 'monospace' }, mediaHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md }, sectionTitle: { color: COLORS.text, fontWeight: '800', fontSize: 16 }, help: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 }, count: { color: COLORS.primaryActive, fontSize: 11, fontFamily: 'monospace' }, mediaButtons: { flexDirection: 'row', gap: SPACING.sm }, mediaButton: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#6366f155', backgroundColor: '#312e811c', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, mediaText: { color: '#c7d2fe', fontSize: 12, fontWeight: '700' }, disabled: { opacity: 0.45 }, submit: { minHeight: 56, borderRadius: 15, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: SPACING.sm, shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 12, elevation: 5 }, submitText: { color: COLORS.text, fontSize: 16, fontWeight: '800' }, footnote: { color: COLORS.textSubtle, fontFamily: 'monospace', fontSize: 11, lineHeight: 17, textAlign: 'center' } });
