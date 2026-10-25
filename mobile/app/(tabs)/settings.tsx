import { KeyboardSurface, KeyboardAwareScrollView as ScrollView } from '../../src/ui/KeyboardSurface';
import { useLocalSearchParams } from 'expo-router';
import { CompactWorkbench,IconAction,SettingRow, TextAction } from '../../src/creative/WorkbenchUI';
import { readSettingsDraft, writeSettingsDraft } from '../../src/settings/draft';
import { DataManagementPanel } from '../../src/settings/DataManagementPanel';
import { CreativeAccountPanel } from '../../src/creative/CreativeAccountPanel';
import { videoDecodeOptions } from '../../src/settings/videoDecodeMode';
import { WorkflowSyncPanel } from '../../src/settings/WorkflowSyncPanel';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { readSettings, saveSettings } from '../../src/settings/storage';
import { DEFAULT_LLM_ADVANCED_SETTINGS as advancedDefaults } from '../../src/config/llmDefaults';
import { isDeepSeekV4, reasoningOptions } from '../../src/config/llmReasoning';
import { prepareSettingsForSave, SettingsValidationError } from '../../src/settings/validation';
import { AppIcon } from '../../src/ui/icons';
import { COLORS, SPACING } from '../../src/ui/theme';

import { usePageLayout } from '../../src/ui/adaptiveLayout';
import { DisplayDiagnostics } from '../../src/settings/DisplayDiagnostics';

type Settings = Awaited<ReturnType<typeof readSettings>>;
export default function SettingsScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const normalizeSection=(value?:string)=>value==='legacy'?'accounts':value;
  const [activeSection,setActiveSection]=useState(normalizeSection(section));
  useEffect(()=>setActiveSection(normalizeSection(section)),[section]);
  const layout = usePageLayout();
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [activeSection]);
  const [values, setValues] = useState<Settings>({ ...advancedDefaults, llmEndpoint: 'https://api.openai.com/v1', llmModel: 'gpt-4o-mini', llmApiKey: '', autoExportToGallery: true, keepPrivateCopy: true });
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
    } catch (error) { if (error instanceof SettingsValidationError) { setFieldErrors(Object.fromEntries(error.fields.map(field => [field, error.message]))); setAdvancedOpen(true); setActiveSection(error.fields.some(field => field.startsWith('llm')) ? 'assistant' : 'storage'); } else Alert.alert('保存失败', error instanceof Error ? error.message : '无法保存设置'); }
    finally { saveLock.current = false; setSaving(false); }
  };
  if (!baseline) return <View style={styles.container}>{loadError ? <Pressable accessibilityRole="button" accessibilityLabel="重试读取设置" onPress={() => setLoadAttempt(value => value + 1)} style={styles.saveButton}><Text style={styles.saveText}>设置读取失败，点击重试</Text></Pressable> : <ActivityIndicator accessibilityLabel="正在读取设置" />}</View>;
  return <CompactWorkbench><KeyboardSurface style={styles.container}><ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={[styles.content, layout.contentStyle]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    {draftReadError ? <View style={styles.card}><Text accessibilityRole="alert" style={{ color: COLORS.danger }}>未保存草稿无法读取，已隔离；当前使用已保存设置。</Text><Pressable accessibilityRole="button" accessibilityLabel="丢弃无法读取的草稿" style={styles.resetAdvanced} onPress={() => { void writeSettingsDraft().then(() => { setDraftReadError(false); setDraftError(''); }).catch(() => setDraftError('无法丢弃草稿，请重试；已保存设置不受影响')); }}><Text>丢弃无法读取的草稿</Text></Pressable></View> : null}
    {pendingDraft ? <View style={styles.card}><Text>发现未保存的设置草稿</Text><Pressable accessibilityRole="button" style={styles.resetAdvanced} onPress={() => { setValues(current => ({ ...current, ...pendingDraft })); setPendingDraft(undefined); }}><Text>恢复未保存更改</Text></Pressable><Pressable accessibilityRole="button" style={styles.resetAdvanced} onPress={() => setPendingDraft(undefined)}><Text>丢弃草稿，使用已保存设置</Text></Pressable></View> : null}
    {draftError ? <Text accessibilityRole="alert" style={{ color: COLORS.danger }}>{draftError}</Text> : null}
    {activeSection?<View style={{flexDirection:'row',alignItems:'center',gap:12}}><IconAction label="返回设置分类" icon="arrow_back" onPress={()=>setActiveSection(undefined)}/><Text accessibilityRole="header" style={styles.title}>{activeSection?({accounts:'创作账号',assistant:'助手模型',workflows:'工作流',storage:'存储与导出',playback:'视频播放',advanced:'显示与诊断'} as Record<string,string>)[activeSection]??'设置':'设置'}</Text></View>:null}
    {!activeSection?<>
      <Text style={styles.groupLabel}>连接与能力</Text><View style={styles.group}>
      {([['accounts','创作账号','NovelAI · AutoDL'],['assistant','助手模型','提示词与创作辅助'],['workflows','工作流','已安装能力与同步']] as const).map(([key,label,value])=><SettingRow key={key} label={label} value={value} onPress={()=>setActiveSection(key)}/>)}
      </View><Text style={styles.groupLabel}>使用偏好</Text><View style={styles.group}>
      {([['storage','存储与导出','保存、备份与恢复'],['playback','视频播放','解码模式'],['advanced','显示与诊断','布局与运行信息']] as const).map(([key,label,value])=><SettingRow key={key} label={label} value={value} onPress={()=>setActiveSection(key)}/>)}
      </View><Text style={styles.help}>密钥加密保存在本机，账号连接与工作流配置分开管理。</Text>
    </>:null}
    {activeSection==='accounts'?<>
    <Text style={styles.help}>所有工作台共用以下连接；AutoDL 工作流使用同一份凭据。</Text>
    <CreativeAccountPanel compact />
    <CreativeAccountPanel provider="autodl" compact />

    </>:null}
    {activeSection==='assistant'?<View style={styles.card}><View style={styles.cardHeading}><AppIcon name="smart_toy" size={20} color={COLORS.primaryActive} /><Text style={styles.cardTitle}>创作助手模型</Text></View><Text style={styles.help}>用于讨论创意、编写提示词、组织镜头并协助制作。生成费用另按创作账号授权；不使用助手时可跳过。填写支持 OpenAI 兼容接口的服务地址、模型和密钥。</Text><Field label="LLM API 地址" error={fieldErrors.llmEndpoint} value={values.llmEndpoint} placeholder="https://api.openai.com/v1" autoCapitalize="none" keyboardType="url" onChangeText={(text) => update('llmEndpoint', text)} /><Field label="LLM 模型" error={fieldErrors.llmModel} value={values.llmModel} placeholder="gpt-4o-mini" autoCapitalize="none" onChangeText={(text) => update('llmModel', text)} /><Field label="LLM API Key" error={fieldErrors.llmApiKey} value={values.llmApiKey} secure placeholder="输入服务商提供的 API Key" autoCapitalize="none" onChangeText={(text) => update('llmApiKey', text)} /><Pressable accessibilityRole="button" accessibilityLabel="切换 LLM 高级设置" onPress={() => setAdvancedOpen((open) => !open)} accessibilityState={{ expanded: advancedOpen }} style={styles.advancedToggle}><Text style={styles.advancedToggleText}>高级设置</Text><AppIcon name={advancedOpen ? 'expand_less' : 'expand_more'} size={20} color={COLORS.textMuted} /></Pressable>{advancedOpen ? <View style={styles.advancedPanel}>
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
    :null}
    {activeSection==='storage'?<View style={styles.card}><View style={styles.cardHeading}><AppIcon name="movie_filter" size={20} color={COLORS.primaryActive} /><Text style={styles.cardTitle}>存储与导出</Text></View><View style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingLabel}>自动保存到系统相册</Text><Text style={styles.help}>下载完成后保存到系统相册 / Movies / AutoDL-H3</Text></View><Switch accessibilityLabel="自动保存到系统相册" value={values.autoExportToGallery} onValueChange={(value) => update('autoExportToGallery', value)} trackColor={{ false: COLORS.border, true: COLORS.primaryActive }} thumbColor={COLORS.text} /></View><Text style={styles.location}>保存位置：系统相册 / Movies / AutoDL-H3</Text><View style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingLabel}>保留应用内副本</Text><Text style={styles.help}>关闭后仅在相册保存成功时删除应用内视频</Text></View><Switch accessibilityLabel="保留应用内副本" value={values.keepPrivateCopy} onValueChange={(value) => update('keepPrivateCopy', value)} trackColor={{ false: COLORS.border, true: COLORS.primaryActive }} thumbColor={COLORS.text} /></View></View>
    :null}
    {activeSection==='playback'?<View style={styles.card}><Text style={styles.cardTitle}>视频解码</Text><Text style={styles.help}>默认使用自动模式；遇到黑屏或播放异常时可尝试其他模式。保存后对应用内播放生效。</Text><View style={styles.effortOptions} accessibilityRole="radiogroup" accessibilityLabel="视频解码模式">{videoDecodeOptions.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`视频解码：${option.label}`} accessibilityState={{ checked: (values.videoDecodeMode ?? 'auto') === option.value }} onPress={() => update('videoDecodeMode', option.value)} style={[styles.effortOption, (values.videoDecodeMode ?? 'auto') === option.value && styles.effortSelected]}><Text style={styles.effortText}>{option.label}</Text></Pressable>)}</View><Text style={styles.help}>{videoDecodeOptions.find(option => option.value === (values.videoDecodeMode ?? 'auto'))?.help}</Text><Text style={styles.help}>此选项不会修改视频原件，也不会影响系统相册中的视频。</Text></View>
    :null}
    {activeSection==='workflows'?<WorkflowSyncPanel />:null}

    {activeSection==='storage'?<DataManagementPanel />:null}
    {activeSection==='advanced'?<DisplayDiagnostics />:null}
  </ScrollView>{dirty || ['assistant','storage','playback'].includes(activeSection??'') ? <View style={styles.saveBar}><View style={[layout.contentStyle, styles.saveContent]}>
    <Text accessibilityLiveRegion="polite" style={styles.help}>{saving ? '正在保存…' : dirty ? draftReadError ? '有未保存更改，草稿暂不可用；请保存设置' : '有未保存更改，草稿将加密保留；保存后生效' : '设置已保存'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="保存设置" disabled={saving || !dirty} onPress={() => void save()} style={[styles.saveButton, (saving || !dirty) && styles.disabled]}><AppIcon name="save" size={20} color={COLORS.onPrimary} /><Text style={styles.saveText}>{saving ? '保存中…' : '保存设置'}</Text></Pressable>
  </View></View> : null}</KeyboardSurface></CompactWorkbench>;
}
function Field({ label, secure, error, ...props }: { label: string; secure?: boolean; error?: string } & React.ComponentProps<typeof TextInput>) {
  const [visible, setVisible] = useState(false);
  const input = useRef<TextInput>(null);
  useEffect(() => { if (error) input.current?.focus(); }, [error]);
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput ref={input} accessibilityHint={error} accessibilityLabel={label} {...props} autoCorrect={false} autoCapitalize={props.autoCapitalize ?? 'none'} secureTextEntry={secure && !visible} placeholderTextColor={COLORS.textSubtle} style={[styles.input, error && { borderColor: COLORS.danger }]} />{error ? <Text accessibilityRole="alert" style={{ color: COLORS.danger, fontSize: 13 }}>{error}</Text> : null}{secure ? <Pressable accessibilityRole="button" accessibilityLabel={`${visible ? '隐藏' : '显示'}${label}`} onPress={() => setVisible(value => !value)} style={styles.resetAdvanced}><Text style={styles.externalLinkText}>{visible ? '隐藏' : '显示'}内容</Text></Pressable> : null}</View>;
}
const styles = StyleSheet.create({ saveContent: { gap: 8 }, saveBar: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface }, container: { flex: 1, backgroundColor: COLORS.background }, content: { padding: 16, paddingBottom: 24, gap: 12 }, groupLabel:{color:COLORS.textMuted,fontSize:12,fontWeight:'600',marginTop:12},group:{paddingHorizontal:12,borderRadius:10,backgroundColor:COLORS.surface}, title: { color: COLORS.text, fontSize: 21, fontWeight: '700' }, subtitle: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21, marginTop: SPACING.sm }, card: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, gap: 10 }, cardHeading: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }, cardTitle: { flexShrink: 1, color: COLORS.text, fontSize: 16, fontWeight: '800' }, help: { color: COLORS.textMuted, fontSize: 12, lineHeight: 18 }, field: { gap: SPACING.xs }, label: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 }, input: { color: COLORS.text, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.controlBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 }, externalLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }, externalLinkText: { color: COLORS.primaryActive, fontSize: 13, fontWeight: '700' }, advancedToggle: { minHeight: 44, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, advancedToggleText: { color: COLORS.text, fontSize: 14, fontWeight: '700' }, advancedPanel: { gap: SPACING.md }, effortOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, effortOption: { maxWidth: '100%', minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: COLORS.controlBorder }, effortSelected: { borderColor: COLORS.primaryActive, backgroundColor: COLORS.primarySoft }, effortText: { color: COLORS.text, fontSize: 13 }, effortSelectedText: { color: COLORS.primaryActive, fontWeight: '700' }, resetAdvanced: { minHeight: 44, justifyContent: 'center' }, advancedHint: { color: COLORS.textMuted, fontSize: 12, lineHeight: 18 }, infoLine: { color: COLORS.textMuted, fontSize: 12, lineHeight: 19 }, settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md }, settingCopy: { flex: 1, gap: 4 }, settingLabel: { color: COLORS.text, fontSize: 14, fontWeight: '700' }, location: { color: COLORS.primaryActive, fontSize: 12 }, saveButton: { minHeight: 42, borderRadius: 8, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm }, saveText: { color: COLORS.onPrimary, fontSize: 14, fontWeight: '600' }, disabled: { opacity: 0.5 } });
