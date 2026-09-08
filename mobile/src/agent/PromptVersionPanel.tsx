import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LIGHT_PROMPT_COLORS as colors } from '../ui/theme';
import { diffPromptVersions, type PromptVersion } from './promptVersions';
import { normalizePromptHandoffParameters, type PromptHandoff } from './promptHandoff';
import { validatePromptBindings } from './promptBindings';
import type { WorkflowDefinition } from '../workflows/schema/types';
import defaultWorkflow from '../workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json';
import { createAgentId } from './submissionCommands';

export type PromptVersionPanelProps = {
  versions: PromptVersion[];
  selectedVersionId?: string;
  onSelect: (id: string) => void;
  onRestore: (id: string, commandId: string) => void;
  onExport: (handoff: PromptHandoff) => Promise<void>;
  threadId: string;
  disabled?: boolean;
  inSheet?: boolean;
  onExpand?: () => void;
  workflowDefinition?: WorkflowDefinition;
};

function Action({ label, onPress, disabled = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.action, primary && styles.primary, disabled && styles.disabled]}><Text style={[styles.actionText, primary && styles.primaryText]}>{label}</Text></Pressable>;
}

export function PromptVersionPanel({ versions, selectedVersionId, onSelect, onRestore, onExport, threadId, disabled = false, inSheet = false, onExpand, workflowDefinition = defaultWorkflow as WorkflowDefinition }: PromptVersionPanelProps) {
  const selected = versions.find((version) => version.id === selectedVersionId) ?? versions[versions.length - 1];
  const selectedIndex = versions.findIndex((version) => version.id === selected?.id);
  const prior = versions[selectedIndex - 1];
  const [compare, setCompare] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<{ version: PromptVersion; threadId: string } | null>(null);
  const [included, setIncluded] = useState<string[]>([]);
  const [resolution, setResolution] = useState('');
  const [duration, setDuration] = useState('');
  const [seed, setSeed] = useState('');
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const visibleStart = Math.max(0, versions.length - visibleCount);
  const exportLock = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    exportLock.current = false;
    setBusy(false); setPreview(null); setError(''); setCompare(false); setExpanded(false); setCopyStatus(''); setVisibleCount(50);
  }, [threadId]);
  useEffect(() => { setExpanded(false); setCopyStatus(''); }, [selected?.id]);
  const diff = useMemo(() => compare && selected && prior ? diffPromptVersions(prior.promptText, selected.promptText) : [], [compare, selected?.promptText, prior?.promptText]);
  const activePreview = preview?.threadId === threadId ? preview : null;
  const bindings = validatePromptBindings(activePreview?.version.promptText ?? '', activePreview?.version.images.filter(image => included.includes(image.id)) ?? []);
  const { images, missing, invalid: invalidBindings } = bindings;
  const properties = workflowDefinition.inputs.properties as Record<string, { enum?: unknown[] }> | undefined;
  const resolutionOptions = properties?.resolution?.enum?.filter((value): value is string => typeof value === 'string') ?? [];
  const parameterValidation = useMemo(() => {
    try {
      if (duration.trim() && !/^\d+$/.test(duration.trim())) throw new Error('时长须为工作流支持的整数秒数');
      return { parameters: normalizePromptHandoffParameters({ ...(resolution.trim() ? { resolution: resolution.trim() } : {}), ...(duration.trim() ? { durationSeconds: Number(duration) } : {}), ...(seed.trim() ? { seed: seed.trim() } : {}) }, workflowDefinition), error: '' };
    } catch (cause) { return { parameters: {}, error: cause instanceof Error ? cause.message : '生成参数无效' }; }
  }, [resolution, duration, seed, workflowDefinition]);
  const cannotExport = disabled || busy || !activePreview || !bindings.ok || Boolean(parameterValidation.error);

  function openPreview() {
    if (disabled || !selected) return;
    setPreview({ threadId, version: { ...selected, images: selected.images.map((image) => ({ ...image })), parameters: { ...selected.parameters } } });
    setIncluded(selected.images.map((image) => image.id));
    setResolution(selected.parameters.resolution ?? ''); setDuration(selected.parameters.durationSeconds?.toString() ?? ''); setSeed(selected.parameters.seed ?? ''); setError('');
  }
  async function exportPreview() {
    if (cannotExport || exportLock.current || !activePreview) return;
    exportLock.current = true; setBusy(true); setError('');
    const currentGeneration = generation.current;
    try {
      await onExport({ prompt: activePreview.version.promptText, images: images.map((image) => ({ ...image })), parameters: parameterValidation.parameters, source: { threadId: activePreview.threadId, messageId: activePreview.version.sourceMessageId, versionId: activePreview.version.id, ...(activePreview.version.artifactId ? { artifactId: activePreview.version.artifactId } : {}), ...(activePreview.version.sourceRevision !== undefined ? { sourceRevision: activePreview.version.sourceRevision } : {}) } });
      if (generation.current === currentGeneration) setPreview(null);
    } catch (cause) {
      if (generation.current === currentGeneration) setError(cause instanceof Error ? cause.message : '带入失败，请重试');
    } finally {
      if (generation.current === currentGeneration) { exportLock.current = false; setBusy(false); }
    }
  }
  async function copyPrompt() {
    if (!selected) return;
    try { await Clipboard.setStringAsync(selected.promptText); setCopyStatus('已复制'); }
    catch { setCopyStatus('复制失败，请重试'); }
  }
  if (!selected) return null;
  return <View style={[styles.panel, inSheet && styles.sheetPanel]}>
    <View style={styles.heading}>{!inSheet && <Text style={styles.title}>Prompt 版本</Text>}<Text style={styles.muted}>版本 {selectedIndex + 1}{selectedIndex === versions.length - 1 ? ' · 最新' : ' · 历史'}</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.row}>
      {visibleStart > 0 && <Action label="加载更早版本" onPress={() => setVisibleCount(count => count + 50)} />}
      {versions.slice(visibleStart).map((version, index) => <Pressable key={version.id} accessibilityRole="button" accessibilityLabel={`选择版本 ${visibleStart + index + 1}`} accessibilityState={{ selected: version.id === selected.id }} onPress={() => onSelect(version.id)} style={[styles.version, version.id === selected.id && styles.activeVersion]}><Text style={styles.actionText}>V{visibleStart + index + 1}{version.restoredFrom ? ' · 恢复' : ''}</Text></Pressable>)}
    </ScrollView>
    <ScrollView style={inSheet ? { flex: 1 } : { flexGrow: 0 }} contentContainerStyle={{ gap: 12, paddingBottom: 12 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
    <Text selectable numberOfLines={expanded ? undefined : inSheet ? 3 : 7} style={styles.prompt}>{selected.promptText}</Text>
    <View style={styles.row}><Action label={expanded ? '收起 Prompt' : '展开 Prompt'} onPress={() => { if (!expanded) onExpand?.(); setExpanded(!expanded); }} />{prior && <Action label={compare ? '关闭版本比较' : '比较上一版本'} onPress={() => { if (!compare) onExpand?.(); setCompare(!compare); }} />}</View>
    {compare && prior && <View style={styles.diff}><Text style={styles.muted}>V{selectedIndex} → V{selectedIndex + 1} · − 删除 / + 新增</Text><ScrollView style={styles.diffScroll} nestedScrollEnabled>{diff.map((line, index) => <Text key={index} selectable style={[styles.diffLine, line.kind === 'removed' && styles.removed, line.kind === 'added' && styles.added]}>{line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}{line.text}</Text>)}</ScrollView></View>}
    </ScrollView>
    <View style={[{ gap: 10 }, inSheet && styles.sheetFooter]}>
      <View style={styles.row}><Action label="复制版本 Prompt" onPress={copyPrompt} /><Action label="恢复此版本" disabled={disabled} onPress={() => { if (!disabled) onRestore(selected.id, createAgentId()); }} /></View>
      <Action label="预览并带入创建页" primary disabled={disabled} onPress={openPreview} />
    </View>
    {copyStatus ? <Text accessibilityLiveRegion="polite" style={styles.muted}>{copyStatus}</Text> : null}
    {activePreview && <Modal visible transparent statusBarTranslucent animationType="slide" onRequestClose={() => { if (!busy) setPreview(null); }}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <View style={styles.modal} accessibilityViewIsModal onFocus={event => event.stopPropagation()} onBlur={event => event.stopPropagation()}>
          <Text style={styles.title}>带入创建页前确认</Text>
          <ScrollView style={styles.previewScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.previewContent}>
            <Text style={styles.muted}>Prompt</Text><Text selectable style={styles.prompt}>{activePreview.version.promptText}</Text>
            <Text style={styles.title}>绑定图片 · {images.length} / {activePreview.version.images.length}</Text>
            <Text style={styles.muted}>默认列出生成此版本前最近一次上传的图片；请核对引用和标签。点击图片可取消或恢复绑定。</Text>
            <View style={styles.row}>{activePreview.version.images.map((image) => <Pressable key={image.id} accessibilityRole="checkbox" accessibilityLabel={`绑定图片 ${image.displayName}`} accessibilityState={{ checked: included.includes(image.id), disabled: busy }} disabled={busy} onPress={() => setIncluded((ids) => ids.includes(image.id) ? ids.filter((id) => id !== image.id) : [...ids, image.id])} style={[styles.imageCard, included.includes(image.id) && styles.activeVersion]}><Image source={{ uri: image.uri }} style={styles.thumbnail} accessibilityLabel={image.displayName} /><Text style={styles.actionText}>{included.includes(image.id) ? '✓ ' : '○ '}{image.displayName}</Text>{image.filename ? <Text numberOfLines={1} style={styles.filename}>{image.filename}</Text> : null}</Pressable>)}</View>
            {!activePreview.version.images.length && <Text style={styles.muted}>此版本没有可绑定的图片。</Text>}
            {missing.length > 0 && <Text accessibilityRole="alert" style={styles.error}>引用图片缺失或标签不唯一：{missing.join('、')}。请恢复绑定或返回会话补充图片后重新生成。</Text>}
            {invalidBindings && <Text accessibilityRole="alert" style={styles.error}>图片编号必须从图片1连续排列，才能保持创建页的引用对应关系。请保留所选图片之前的图片；若此版本缺少这些图片，请返回会话补充后重新生成。</Text>}
            <Text style={styles.title}>生成参数（可选）</Text><Text style={styles.muted}>留空使用创建页的工作流默认值。</Text>
            <TextInput accessibilityLabel="分辨率（可选）" placeholder="分辨率 · 工作流默认" value={resolution} onChangeText={setResolution} editable={!busy} style={styles.input} />
            <View style={styles.row}>{resolutionOptions.map(value => <Action key={value} label={value} disabled={busy} onPress={() => setResolution(value)} />)}</View>
            <TextInput accessibilityLabel="时长秒数（可选）" placeholder="时长（秒）· 工作流默认" keyboardType="decimal-pad" value={duration} onChangeText={setDuration} editable={!busy} style={styles.input} />
            <TextInput accessibilityLabel="Seed（可选）" placeholder="Seed · 工作流默认" value={seed} onChangeText={setSeed} editable={!busy} style={styles.input} />
            {parameterValidation.error && <Text accessibilityRole="alert" style={styles.error}>{parameterValidation.error}</Text>}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </ScrollView>
          <View style={styles.row}><Action label="取消" disabled={busy} onPress={() => setPreview(null)} /><Action label="带入创建页" primary disabled={cannotExport} onPress={exportPreview} />{busy && <Text accessibilityLiveRegion="polite" style={styles.muted}>正在带入…</Text>}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: 14, gap: 12, marginVertical: 10 },
  sheetPanel: { flex: 1, backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, padding: 0, marginVertical: 0 },
  sheetFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 12 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, fontWeight: '600', color: colors.ink },
  muted: { fontSize: 12, lineHeight: 19, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  version: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  activeVersion: { borderColor: colors.ink, backgroundColor: colors.background },
  prompt: { fontSize: 13, lineHeight: 21, color: colors.ink },
  action: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  actionText: { fontSize: 12, color: colors.ink },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent, alignItems: 'center', minHeight: 48 },
  primaryText: { color: colors.surface },
  disabled: { opacity: 0.4 },
  diff: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, gap: 8 },
  diffScroll: { maxHeight: 250 },
  diffLine: { fontSize: 12, lineHeight: 20, color: colors.ink },
  removed: { color: '#8D3F36', backgroundColor: '#FAEDE9' },
  added: { color: '#315F3B', backgroundColor: '#EAF4EC' },
  overlay: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.35)' },
  modal: { width: '100%', maxWidth: 720, height: '92%', alignSelf: 'center', padding: 18, borderRadius: 18, backgroundColor: colors.surface, gap: 16 },
  previewScroll: { flex: 1, minHeight: 0 },
  previewContent: { gap: 12, paddingBottom: 8 },
  imageCard: { width: 108, minHeight: 122, borderWidth: 1, borderColor: colors.line, padding: 8, borderRadius: 10, gap: 4 },
  thumbnail: { width: 90, height: 72, borderRadius: 6 },
  filename: { color: colors.muted, fontSize: 10 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, color: colors.ink },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
});
