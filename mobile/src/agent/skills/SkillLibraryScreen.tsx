import { useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { getDatabase } from '../../storage/databaseClient';
import { createSkillStore, type SkillVersion } from './store';
import { readSkillZip, SKILL_BYTES, validateSkillPackage, type SkillPackage } from './package';
import { ListAction } from '../../ui/ListPageUI';
import { creativeUI as s } from '../../creative/creativeUI';
import { useFallbackBack } from '../../navigation/useFallbackBack';

const template = '---\nname: scene-review\ndescription: 检查场景描述中的主体、动作和镜头是否清楚\n---\n\n阅读用户的场景描述。指出主体、动作与镜头中的歧义，再给出可供审阅的改写。保留用户明确给出的约束。';

export function SkillLibraryScreen() {
  const router = useRouter();
  const back = useCallback(() => router.canGoBack() ? router.back() : router.replace('/(tabs)/agent'), [router]);
  useFallbackBack(back);
  const store = useMemo(() => createSkillStore(getDatabase()), []);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof store.runs>>>([]);
  const [text, setText] = useState(''), [preview, setPreview] = useState<SkillPackage>();
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const refresh = useCallback(async () => { const [items, history] = await Promise.all([store.list(), store.runs()]); setVersions(items); setRuns(history); }, [store]);
  useFocusEffect(useCallback(() => { void refresh().catch(error => setNotice(String(error.message))); }, [refresh]));
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    try { await work(); await refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : '操作失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0], file = new File(asset.uri);
    if (file.size > SKILL_BYTES) throw new Error('技能文件最大 512 KiB');
    if (/\.zip$/i.test(asset.name)) setPreview(readSkillZip(await file.bytes()));
    else if (/\.md$/i.test(asset.name)) setPreview(validateSkillPackage({ 'SKILL.md': await file.text() }));
    else throw new Error('请选择 SKILL.md 或单技能 ZIP 文件');
  };
  return <SafeAreaView style={s.screen}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <ListAction label="返回" secondary onPress={back} />
      <Text accessibilityRole="header" style={s.heading}>本地技能</Text>
      <Text style={s.muted}>内置 H3 技能随应用提供且只读。本地技能是可复用的文本指导，启用后供默认助手及项目对话的新运行使用；不会增加工具或生成额度。</Text>
      <ListAction label="从对话提炼技能" secondary disabled={busy} onPress={() => router.push('/agent-skill-extract')} />
      <TextInput accessibilityLabel="技能文本" placeholder="粘贴带有 name、description 头部的 SKILL.md" value={text} onChangeText={setText} editable={!busy} multiline maxLength={SKILL_BYTES} style={[s.input, { minHeight: 160, textAlignVertical: 'top' }]} />
      <ListAction label="填入技能示例" secondary disabled={busy} onPress={() => setText(template)} />
      <ListAction label="检查粘贴的技能" disabled={busy || !text.trim()} onPress={() => void run(async () => { setPreview(validateSkillPackage({ 'SKILL.md': text })); })} />
      <ListAction label="导入 SKILL.md 或 ZIP" secondary disabled={busy} onPress={() => void run(pick)} />
      {preview ? <View style={s.card}>
        <Text style={s.title}>{preview.name} · {preview.id.slice(0, 8)}</Text>
        <Text style={s.body}>{preview.description}</Text>
        <Text style={s.muted}>{Object.keys(preview.files).join('\n')}</Text>
        <Text selectable style={s.body}>{preview.files['SKILL.md'].slice(0, 4000)}</Text>
        <ListAction label="安装此版本" disabled={busy} onPress={() => void run(async () => { await store.install(preview); setPreview(undefined); setNotice('已安装。请在下方明确启用，安装本身不会改变助手。'); })} />
        <ListAction label="关闭预览" secondary disabled={busy} onPress={() => setPreview(undefined)} />
      </View> : null}
      {notice ? <Text accessibilityRole="alert" style={s.body}>{notice}</Text> : null}
      <Text style={s.title}>已安装版本</Text>
      <Text style={s.muted}>同名技能每次只启用一个版本。切换版本仅影响新运行；停用并撤销会停止使用该版本的运行，已产生的任务仍按原授权管理。</Text>
      {!versions.length ? <Text style={s.muted}>尚未安装本地技能。</Text> : null}
      {versions.map(version => <View key={version.id} style={s.card}>
        <Text style={s.title}>{version.name} · {version.id.slice(0, 8)}{version.enabled ? ' · 已启用' : ''}</Text>
        <Text style={s.body}>{version.description}</Text>
        <ListAction label={`查看 ${version.name} ${version.id.slice(0, 8)}`} secondary disabled={busy} onPress={() => setPreview(version)} />
        {!version.enabled ? <ListAction label={`启用 ${version.name} ${version.id.slice(0, 8)}`} disabled={busy} onPress={() => void run(async () => { await store.enable(version.id); setNotice('已启用，将在新运行中使用这个固定版本。'); })} /> : null}
        <ListAction label={`停用并撤销 ${version.name} ${version.id.slice(0, 8)}`} secondary disabled={busy} onPress={() => void run(async () => { await store.revoke(version.id); setNotice('已停用，使用该版本的运行已请求停止。内容版本仍保留供历史核对。'); })} />
      </View>)}
      {runs.length ? <><Text style={s.title}>最近运行的技能快照</Text>{runs.map(item => <Text key={`${item.threadId}:${item.runId}`} selectable style={s.muted}>
        {item.runId.slice(0, 12)} · {item.snapshot.versions.length ? item.snapshot.versions.map(ref => `${versions.find(v => v.id === ref.id)?.name ?? '缺失技能'}@${ref.id.slice(0, 8)}`).join('、') : '仅内置技能'}
      </Text>)}</> : null}
      <Text style={s.muted}>技能正文、版本及运行引用随应用的完整本地备份保存；不依赖原导入文件。恢复后不会自动运行。</Text>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
