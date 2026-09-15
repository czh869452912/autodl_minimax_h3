import { readSettingsDraft, writeSettingsDraft } from '../../src/settings/draft';
import { DataManagementPanel } from '../../src/settings/DataManagementPanel';
import { videoDecodeOptions } from '../../src/settings/videoDecodeMode';
import { WorkflowSyncPanel } from '../../src/settings/WorkflowSyncPanel';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readSettings, saveSettings } from '../../src/settings/storage';
import { DEFAULT_LLM_ADVANCED_SETTINGS as advancedDefaults } from '../../src/config/llmDefaults';
import { isDeepSeekV4, reasoningOptions } from '../../src/config/llmReasoning';
import { prepareSettingsForSave, SettingsValidationError } from '../../src/settings/validation';
import { AppIcon } from '../../src/ui/icons';
import { COLORS, SPACING } from '../../src/ui/theme';

import { usePageLayout } from '../../src/ui/adaptiveLayout';
import { DisplayDiagnostics } from '../../src/settings/DisplayDiagnostics';

type Settings = Awaited<ReturnType<typeof readSettings>>;
const AUTODL_TOKEN_URL = 'https://autodl.art/large-model/tokens';
export default function SettingsScreen() {
  const layout = usePageLayout();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const revealFocusedInput = () => {
    if (!Keyboard.isVisible()) return;
    const focused = TextInput.State.currentlyFocusedInput();
    // The responder measures from the scroll content origin; this screen is
    // below the tabs' top SafeAreaView. Recheck after keyboard layout settles.
    if (focused) scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(focused, insets.top + 16, true);
  };
  const [values, setValues] = useState<Settings>({ ...advancedDefaults, token: '', llmEndpoint: 'https://api.openai.com/v1', llmModel: 'gpt-4o-mini', llmApiKey: '', autoExportToGallery: true, keepPrivateCopy: true });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Settings, string>>>({});
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [pendingDraft, setPendingDraft] = useState<Partial<Settings>>();
  const [draftError, setDraftError] = useState('');
  const [draftReadError, setDraftReadError] = useState(false);
  const [baseline, setBaseline] = useState<Settings>();
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const dirty = baseline != null && Object.keys({ ...baseline, ...values }).some(key => values[key as keyof Settings] !== baseline[key as keyof Settings]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setLoadError(false); setDraftReadError(false);
    void Promise.all([readSettings(), readSettingsDraft().catch(() => { if (active) setDraftReadError(true); return undefined; })]).then(([saved, draft]) => { if (active) { const next = { ...advancedDefaults, ...saved }; setValues(next); setBaseline(next); setPendingDraft(draft); } }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [loadAttempt]);
  useEffect(() => {
    if (!baseline || pendingDraft || draftReadError) return;
    let active = true;
    void writeSettingsDraft(dirty ? values : undefined).then(() => { if (active) setDraftError(''); }).catch(() => { if (active) setDraftError('草稿保存失败，请保存设置后再退出'); });
    return () => { active = false; };
  }, [values, baseline, pendingDraft, dirty, draftReadError]);
  const update = (key: keyof Settings, value: string | boolean) => setValues(current => {
    const next = { ...current, [key]: value };
    if (key === 'llmModel' && !reasoningOptions(String(value)).some(option => option.value === (current.llmReasoningEffort ?? 'default'))) next.llmReasoningEffort = 'default';
    return next;
  });
  const save = async () => {
    if (saveLock.current || !baseline) return;
    saveLock.current = true; setSaving(true);
    try {
      const prepared = prepareSettingsForSave(values); setFieldErrors({});
      await saveSettings(prepared);
      setValues(current => current === values ? prepared : current); setBaseline(prepared);
    } catch (error) { if (error instanceof SettingsValidationError) { setFieldErrors(Object.fromEntries(error.fields.map(field => [field, error.message]))); setAdvancedOpen(true); } else Alert.alert('保存失败', error instanceof Error ? error.message : '无法保存设置'); }
    finally { saveLock.current = false; setSaving(false); }
  };
  const openAutodlTokenPage = async () => {
    try {
      await Linking.openURL(AUTODL_TOKEN_URL);
    } catch {
      Alert.alert('无法打开页面', '请手动访问 https://autodl.art/large-model/tokens 获取 Access Token。');
    }
  };
  if (!baseline) return <View style={styles.container}>{loadError ? <Pressable accessibilityRole="button" accessibilityLabel="重试读取设置" onPress={() => setLoadAttempt(value => value + 1)} style={styles.saveButton}><Text style={styles.saveText}>设置读取失败，点击重试</Text></Pressable> : <ActivityIndicator accessibilityLabel="正在读取设置" />}</View>;
  return <KeyboardAvoidingView style={styles.container} behavior="padding" keyboardVerticalOffset={insets.top}><ScrollView ref={scrollRef} onLayout={revealFocusedInput} style={styles.container} contentContainerStyle={[styles.content, layout.contentStyle]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    {draftReadError ? <View style={styles.card}><Text accessibilityRole="alert" style={{ color: COLORS.danger }}>未保存草稿无法读取，已隔离；当前使用已保存设置。</Text><Pressable accessibilityRole="button" accessibilityLabel="丢弃无法读取的草稿" style={styles.resetAdvanced} onPress={() => { void writeSettingsDraft().then(() => { setDraftReadError(false); setDraftError(''); }).catch(() => setDraftError('无法丢弃草稿，请重试；已保存设置不受影响')); }}><Text>丢弃无法读取的草稿</Text></Pressable></View> : null}
    {pendingDraft ? <View style={styles.card}><Text>发现未保存的设置草稿</Text><Pressable accessibilityRole="button" style={styles.resetAdvanced} onPress={() => { setValues(current => ({ ...current, ...pendingDraft })); setPendingDraft(undefined); }}><Text>恢复未保存更改</Text></Pressable><Pressable accessibilityRole="button" style={styles.resetAdvanced} onPress={() => setPendingDraft(undefined)}><Text>丢弃草稿，使用已保存设置</Text></Pressable></View> : null}
    {draftError ? <Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{draftError}</Text> : null}
    <View><Text style={styles.title}>系统设置</Text><Text style={styles.subtitle}>配置 AutoDL 连接令牌与 Prompt 助手 LLM。所有密钥仅保存在本机安全存储中。</Text></View>
    <View style={styles.card}><View style={styles.cardHeading}><AppIcon name="key" size={20} color={COLORS.primaryActive} /><Text style={styles.cardTitle}>AutoDL ComfyUI Token</Text></View><Text style={styles.help}>用于提交任务、查询状态和自动下载结果。Token 不会写入源码或上传到第三方。</Text><Field label="ComfyUI Token" error={fieldErrors.token} value={values.token} secure placeholder="输入 AutoDL ComfyUI 分组 Token" onChangeText={(text) => update('token', text)} /><Pressable accessibilityRole="link" accessibilityLabel="打开 AutoDL Token 获取页面" onPress={() => void openAutodlTokenPage()} style={styles.externalLink}><Text style={styles.externalLinkText}>前往 AutoDL 获取 Access Token ↗</Text></Pressable></View>
    <View style={styles.card}><View style={styles.cardHeading}><AppIcon name="smart_toy" size={20} color={COLORS.primaryActive} /><Text style={styles.cardTitle}>Prompt 助手 LLM</Text></View><Text style={styles.help}>Agent Harness、官方 H3 skills、工具调用和会话全部在本机运行。此处仅配置外部 OpenAI-compatible LLM API。</Text><Field label="LLM API 地址" error={fieldErrors.llmEndpoint} value={values.llmEndpoint} placeholder="https://api.openai.com/v1" autoCapitalize="none" keyboardType="url" onChangeText={(text) => update('llmEndpoint', text)} /><Field label="LLM 模型" error={fieldErrors.llmModel} value={values.llmModel} placeholder="gpt-4o-mini" autoCapitalize="none" onChangeText={(text) => update('llmModel', text)} /><Field label="LLM API Key" error={fieldErrors.llmApiKey} value={values.llmApiKey} secure placeholder="仅保存在 Android Keystore" autoCapitalize="none" onChangeText={(text) => update('llmApiKey', text)} /><Pressable accessibilityRole="button" accessibilityLabel="切换 LLM 高级设置" onPress={() => setAdvancedOpen((open) => !open)} accessibilityState={{ expanded: advancedOpen }} style={styles.advancedToggle}><Text style={styles.advancedToggleText}>高级设置</Text><AppIcon name={advancedOpen ? 'expand_less' : 'expand_more'} size={20} color={COLORS.textMuted} /></Pressable>{advancedOpen ? <View style={styles.advancedPanel}>
      <Text style={styles.advancedHint}>留空使用标注的默认值；修改后点击底部“保存设置”生效。</Text>
      <Field label="最大输出（tokens）" error={fieldErrors.llmMaxOutputTokens} value={values.llmMaxOutputTokens ?? advancedDefaults.llmMaxOutputTokens} placeholder="4096" keyboardType="number-pad" onChangeText={text => update('llmMaxOutputTokens', text)} />
      <Text style={styles.help}>默认 4096，每次模型调用单独计算。部分模型的思考与最终正文共用此预算；只返回思考或输出被截断时，可按服务商支持范围提高。</Text>
      <Field label="模型上下文上限（tokens）" error={fieldErrors.llmContextWindowTokens} value={values.llmContextWindowTokens ?? advancedDefaults.llmContextWindowTokens} placeholder="32768" keyboardType="number-pad" onChangeText={text => update('llmContextWindowTokens', text)} />
      <Text style={styles.help}>默认 32768。本机据此预留输入与输出空间；输出预算至少 256，且不超过上下文的一半。请勿超过模型实际支持的上限。</Text>
      <Text style={styles.settingLabel}>思考强度</Text>
      <View style={styles.effortOptions} accessibilityRole="radiogroup" accessibilityLabel="思考强度">
        {reasoningOptions(values.llmModel).map(option => {
          const selected = (values.llmReasoningEffort ?? 'default') === option.value;
          return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`思考强度：${option.label}`} accessibilityState={{ checked: selected }} onPress={() => update('llmReasoningEffort', option.value)} style={[styles.effortOption, selected && styles.effortSelected]}><Text style={[styles.effortText, selected && styles.effortSelectedText]}>{option.label}</Text></Pressable>;
        })}
      </View>
      <Text style={styles.help}>{isDeepSeekV4(values.llmModel) ? 'DeepSeek V4：服务商默认开启思考，强度 high；可关闭或选择 low / high / max。强度越高，通常耗时和输出 token 越多。' : '默认不发送思考参数，沿用服务商设置。手动强度仅适用于支持 reasoning_effort 的模型；不支持时请选“服务商默认”。'} 思考强度不会自动提高最大输出预算。</Text>
      <Field label="请求超时（秒）" error={fieldErrors.llmTimeoutSeconds} value={values.llmTimeoutSeconds} placeholder="600" keyboardType="number-pad" onChangeText={text => update('llmTimeoutSeconds', text)} />
      <Field label="最大重试次数" error={fieldErrors.llmMaxRetries} value={values.llmMaxRetries} placeholder="2" keyboardType="number-pad" onChangeText={text => update('llmMaxRetries', text)} />
      <Text style={styles.help}>默认单次请求超时 600 秒、最多重试 2 次。整轮运行上限为请求超时的 2 倍（至少 60 秒）；重试会增加等待时间和 API 调用次数。</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="恢复 LLM 高级设置默认值" onPress={() => setValues(current => ({ ...current, ...advancedDefaults }))} style={styles.resetAdvanced}><Text style={styles.externalLinkText}>恢复高级设置默认值</Text></Pressable>
    </View> : null}</View>
    <View style={styles.card}><View style={styles.cardHeading}><AppIcon name="movie_filter" size={20} color={COLORS.primaryActive} /><Text style={styles.cardTitle}>存储与导出</Text></View><View style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingLabel}>自动保存到系统相册</Text><Text style={styles.help}>下载完成后保存到系统相册 / Movies / AutoDL-H3</Text></View><Switch accessibilityLabel="自动保存到系统相册" value={values.autoExportToGallery} onValueChange={(value) => update('autoExportToGallery', value)} trackColor={{ false: COLORS.border, true: COLORS.primaryActive }} thumbColor={COLORS.text} /></View><Text style={styles.location}>保存位置：系统相册 / Movies / AutoDL-H3</Text><View style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingLabel}>保留应用内副本</Text><Text style={styles.help}>关闭后仅在相册保存成功时删除应用内视频</Text></View><Switch accessibilityLabel="保留应用内副本" value={values.keepPrivateCopy} onValueChange={(value) => update('keepPrivateCopy', value)} trackColor={{ false: COLORS.border, true: COLORS.primaryActive }} thumbColor={COLORS.text} /></View></View>
    <View style={styles.card}><Text style={styles.cardTitle}>视频解码</Text><Text style={styles.help}>直接播放下载的原件，不生成兼容转码副本。保存设置后对应用内视频生效。</Text><View style={styles.effortOptions} accessibilityRole="radiogroup" accessibilityLabel="视频解码模式">{videoDecodeOptions.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`视频解码：${option.label}`} accessibilityState={{ checked: (values.videoDecodeMode ?? 'auto') === option.value }} onPress={() => update('videoDecodeMode', option.value)} style={[styles.effortOption, (values.videoDecodeMode ?? 'auto') === option.value && styles.effortSelected]}><Text style={styles.effortText}>{option.label}</Text></Pressable>)}</View><Text style={styles.help}>{videoDecodeOptions.find(option => option.value === (values.videoDecodeMode ?? 'auto'))?.help}</Text><Text style={styles.help}>封面独立使用软件解码重新生成，不修改视频原件。模式不会影响保存到系统相册的内容。</Text></View>
    <WorkflowSyncPanel />
    <DataManagementPanel />
    <DisplayDiagnostics />
  </ScrollView><View style={[styles.saveBar, layout.contentStyle]}>
    <Text accessibilityLiveRegion="polite" style={styles.help}>{saving ? '正在保存…' : dirty ? draftReadError ? '有未保存更改，草稿暂不可用；请保存设置' : '有未保存更改，草稿将加密保留；保存后生效' : '设置已保存'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="保存设置" disabled={saving || !dirty} onPress={() => void save()} style={[styles.saveButton, (saving || !dirty) && styles.disabled]}><AppIcon name="save" size={20} color={COLORS.onPrimary} /><Text style={styles.saveText}>{saving ? '保存中…' : '保存设置'}</Text></Pressable>
  </View></KeyboardAvoidingView>;
}
function Field({ label, secure, error, ...props }: { label: string; secure?: boolean; error?: string } & React.ComponentProps<typeof TextInput>) {
  const [visible, setVisible] = useState(false);
  const input = useRef<TextInput>(null);
  useEffect(() => { if (error) input.current?.focus(); }, [error]);
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput ref={input} accessibilityHint={error} accessibilityLabel={label} {...props} autoCorrect={false} autoCapitalize={props.autoCapitalize ?? 'none'} secureTextEntry={secure && !visible} placeholderTextColor={COLORS.textSubtle} style={[styles.input, error && { borderColor: COLORS.danger }]} />{error ? <Text accessibilityRole="alert" style={{ color: COLORS.danger, fontSize: 13 }}>{error}</Text> : null}{secure ? <Pressable accessibilityRole="button" accessibilityLabel={`${visible ? '隐藏' : '显示'}${label}`} onPress={() => setVisible(value => !value)} style={styles.resetAdvanced}><Text style={styles.externalLinkText}>{visible ? '隐藏' : '显示'}内容</Text></Pressable> : null}</View>;
}
const styles = StyleSheet.create({ saveBar: { padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface }, container: { flex: 1, backgroundColor: COLORS.background }, content: { padding: SPACING.xl, paddingBottom: 24, gap: SPACING.lg }, title: { color: COLORS.text, fontSize: 30, fontWeight: '800' }, subtitle: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21, marginTop: SPACING.sm }, card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: SPACING.lg, gap: SPACING.md }, cardHeading: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }, cardTitle: { flexShrink: 1, color: COLORS.text, fontSize: 16, fontWeight: '800' }, help: { color: COLORS.textMuted, fontSize: 12, lineHeight: 18 }, field: { gap: SPACING.xs }, label: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 }, input: { color: COLORS.text, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.controlBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14 }, externalLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }, externalLinkText: { color: COLORS.primaryActive, fontSize: 13, fontWeight: '700' }, advancedToggle: { minHeight: 44, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, advancedToggleText: { color: COLORS.text, fontSize: 14, fontWeight: '700' }, advancedPanel: { gap: SPACING.md }, effortOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, effortOption: { maxWidth: '100%', minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: COLORS.controlBorder }, effortSelected: { borderColor: COLORS.primaryActive, backgroundColor: COLORS.primarySoft }, effortText: { color: COLORS.text, fontSize: 13 }, effortSelectedText: { color: COLORS.primaryActive, fontWeight: '700' }, resetAdvanced: { minHeight: 44, justifyContent: 'center' }, advancedHint: { color: COLORS.textMuted, fontSize: 12, lineHeight: 18 }, infoLine: { color: COLORS.textMuted, fontSize: 12, lineHeight: 19 }, settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md }, settingCopy: { flex: 1, gap: 4 }, settingLabel: { color: COLORS.text, fontSize: 14, fontWeight: '700' }, location: { color: COLORS.primaryActive, fontSize: 12 }, saveButton: { minHeight: 54, borderRadius: 14, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm }, saveText: { color: COLORS.onPrimary, fontSize: 16, fontWeight: '800' }, disabled: { opacity: 0.5 } });
