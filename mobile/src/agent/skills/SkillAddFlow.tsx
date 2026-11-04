import {useEffect, useMemo, useRef, useState} from 'react';
import {Alert, Keyboard, StyleSheet, Text, TextInput, View} from 'react-native';
import {useRouter} from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import {File} from 'expo-file-system';
import {IconAction} from '../../creative/WorkbenchUI';
import {KeyboardSurface, KeyboardAwareScrollView} from '../../ui/KeyboardSurface';
import {ListAction} from '../../ui/ListPageUI';
import {COLORS} from '../../ui/theme';
import {getDatabase} from '../../storage/databaseClient';
import {readSkillZip, SKILL_BYTES, validateSkillPackage, type SkillPackage} from './package';
import {createSkillStore} from './store';
import {selectNextRunSkills, type SkillSelectionScope} from './nextRun';

type Stage = 'source' | 'edit' | 'review' | 'installed';
export type SkillAddStatus = {dirty: boolean; busy: boolean};
const example = '---\nname: scene-review\ndescription: 检查场景描述中的主体、动作和镜头是否清楚\n---\n\n阅读用户的场景描述。指出主体、动作与镜头中的歧义，再给出可供审阅的改写。保留用户明确给出的约束。';

/** One installation task within the existing library route, never a second store. */
export function SkillAddFlow({projectId, threadId, onStatus, onCancel, onReturn, onDone}: {
  projectId?: string; threadId?: string; onStatus: (status: SkillAddStatus) => void;
  onCancel: () => void; onReturn: () => void; onDone: (id: string) => void;
}) {
  const router = useRouter();
  const db = useMemo(getDatabase, []), store = useMemo(() => createSkillStore(db), [db]);
  const [stage, setStage] = useState<Stage>('source');
  const [purpose, setPurpose] = useState(''), [scope, setScope] = useState('');
  const [text, setText] = useState(''), [files, setFiles] = useState<Record<string, string>>({});
  const [format, setFormat] = useState(false), [source, setSource] = useState('手写草稿');
  const [preview, setPreview] = useState<SkillPackage>(), [installed, setInstalled] = useState<SkillPackage>();
  const [selectedFile, setSelectedFile] = useState('SKILL.md');
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [used, setUsed] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [origin, setOrigin] = useState<SkillSelectionScope>(), [originError, setOriginError] = useState('');
  const lock = useRef(false), alive = useRef(true);
  const scroll = useRef<React.ElementRef<typeof KeyboardAwareScrollView>>(null);
  const dirty = !installed && Boolean(text || purpose || scope || Object.keys(files).length);
  useEffect(() => { onStatus({dirty, busy}); }, [dirty, busy, onStatus]);
  useEffect(() => {
    alive.current = true;
    if (threadId) void Promise.all([
      db.getFirstAsync<{project_id: string | null; revision: number}>('SELECT project_id,revision FROM creative_agent_scopes WHERE thread_id=?', threadId),
      db.getFirstAsync<{epoch: string}>('SELECT epoch FROM creative_execution_state WHERE id=1'),
    ]).then(([binding, execution]) => {
      if (!alive.current) return;
      if (!binding || !execution || (binding.project_id ?? undefined) !== projectId) throw Error('原会话项目已变化，请返回会话重新选用。');
      setOrigin({projectId: binding.project_id, revision: binding.revision, epoch: execution.epoch});
    }).catch(error => { if (alive.current) setOriginError(error instanceof Error ? error.message : '原会话范围不可用，请返回会话选用。'); });
    return () => { alive.current = false; };
  }, [db, projectId, threadId]);
  const move = (next: Stage) => { Keyboard.dismiss(); setInputFocused(false); setStage(next); setNotice(''); scroll.current?.scrollTo({y: 0, animated: false}); };
  const work = async (operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    try {
      if (db !== getDatabase()) throw Error('数据已恢复，请重新打开技能添加。');
      await operation();
    } catch (error) { if (alive.current) setNotice(error instanceof Error ? error.message : '操作失败，草稿已保留，请重试。'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const replace = (apply: () => void) => {
    const accept = () => { if (alive.current && !lock.current) apply(); };
    if (dirty) Alert.alert('替换当前草稿？', '当前文字和附加文件将被替换，尚未安装的内容会丢失。', [
      {text: '保留当前草稿', style: 'cancel'}, {text: '替换草稿', style: 'destructive', onPress: accept},
    ]);
    else apply();
  };
  const pick = () => work(async () => {
    const result = await DocumentPicker.getDocumentAsync({type: '*/*', copyToCacheDirectory: true, multiple: false});
    if (result.canceled || !alive.current) return;
    const asset = result.assets[0], file = new File(asset.uri);
    if (file.size > SKILL_BYTES) throw Error('技能文件最大 512 KiB');
    let next: Record<string, string>;
    if (/\.zip$/i.test(asset.name)) next = readSkillZip(await file.bytes()).files;
    else if (/\.md$/i.test(asset.name)) next = {'SKILL.md': await file.text()};
    else throw Error('请选择 SKILL.md 或单技能 ZIP 文件');
    if (!alive.current) return;
    // A replacement prompt opens after the picker operation releases its lock.
    const apply = () => { setFiles(next); setText(next['SKILL.md']); setPurpose(''); setScope(''); setFormat(true); setSource(asset.name); setPreview(undefined); move('edit'); };
    if (dirty) Alert.alert('替换当前草稿？', '导入文件会替换当前草稿；取消可保留原输入。', [{text: '保留当前草稿', style: 'cancel'}, {text: '替换草稿', onPress: () => { if (alive.current && !lock.current) apply(); }}]);
    else apply();
  });
  const check = () => work(async () => {
    const pkg = validateSkillPackage({...files, 'SKILL.md': text});
    setPreview(pkg); setSelectedFile('SKILL.md'); move('review');
  });
  const publish = () => work(async () => {
    if (!preview) return;
    // Validate exactly the reviewed content again; no editable text is installed implicitly.
    const pkg = validateSkillPackage(preview.files);
    await store.install(pkg);
    if (alive.current) { setInstalled(pkg); move('installed'); }
  });
  const title = {source: '选择来源', edit: '编辑技能', review: '检查并安装', installed: '安装完成'}[stage];
  const previous = () => {
    if (busy) return;
    if (stage === 'review') { setPreview(undefined); move('edit'); }
    else if (stage === 'edit') move('source');
    else if (stage === 'installed' && installed) onDone(installed.id);
    else onCancel();
  };
  const footer = stage === 'edit' && format ? <ListAction label="检查技能" disabled={busy || !text.trim()} onPress={() => void check()}/> : stage === 'review' ? <>
    <Text style={s.muted}>安装只保存到本机，不改变项目或全局默认。</Text>
    <ListAction label={busy ? '正在安装…' : '安装此版本'} disabled={busy || !preview} onPress={() => void publish()}/>
  </> : null;
  const inputFocus = {onFocus: () => setInputFocused(true), onBlur: () => setInputFocused(false)};
  return <KeyboardSurface enabled={stage === 'edit' && inputFocused} style={{flex: 1}}>
    <View style={s.header}>
      <IconAction label={stage === 'source' ? '关闭添加' : stage === 'review' ? '返回编辑' : stage === 'installed' ? '返回技能目录' : '返回来源'} icon="arrow_back" disabled={busy} onPress={previous}/>
      <Text accessibilityRole="header" style={s.heading}>{title}</Text>
      <Text style={s.muted}>{stage === 'installed' ? '已完成' : `${{source: 1, edit: 2, review: 3}[stage]}/3`}</Text>
    </View>
    <KeyboardAwareScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {notice ? <Text accessibilityRole="alert" style={s.error}>{notice}</Text> : null}
      {stage === 'source' ? <>
        <Text style={s.body}>选择一种方式开始。编辑和检查完成后，再安装到本机。</Text>
        {dirty ? <View style={s.card}><Text style={s.body}>已有未安装草稿</Text><ListAction label="继续编辑草稿" onPress={() => move('edit')}/></View> : null}
        <View style={s.card}><Text style={s.label}>从文件导入</Text><Text style={s.muted}>SKILL.md 或单技能 ZIP；保留包内附加文本文件。</Text><ListAction label="选择技能文件" disabled={busy} onPress={() => void pick()}/></View>
        <View style={s.card}><Text style={s.label}>手写或粘贴</Text><Text style={s.muted}>在本机创建可编辑草稿，不调用模型。</Text><ListAction label={dirty ? '继续手写或粘贴' : '手写或粘贴技能'} secondary disabled={busy} onPress={() => move('edit')}/></View>
        <View style={s.card}><Text style={s.label}>从对话提炼</Text><Text style={s.muted}>进入现有提炼页，选择对话证据并审阅；发起提炼时才调用已配置模型。</Text><ListAction label="打开对话提炼" secondary disabled={busy} onPress={() => {
          const leave = () => router.push({pathname: '/agent-skill-extract', params: {projectId, threadId}});
          if (dirty) Alert.alert('先保留当前草稿', '返回编辑或完成安装后，再进入对话提炼。'); else leave();
        }}/></View>
      </> : null}
      {stage === 'edit' ? <>
        <Text style={s.muted}>来源：{source} · 此处不会修改已有版本</Text>
        {!format ? <>
          <Text style={s.label}>用途</Text><TextInput {...inputFocus} accessibilityLabel="技能用途" placeholder="这项技能帮助完成什么" value={purpose} onChangeText={setPurpose} editable={!busy} style={s.input}/>
          <Text style={s.label}>适用范围与约束</Text><TextInput {...inputFocus} accessibilityLabel="技能适用范围" placeholder="什么场景使用，有哪些约束" value={scope} onChangeText={setScope} editable={!busy} multiline style={s.input}/>
          <ListAction label="创建草稿" disabled={busy || !purpose.trim()} onPress={() => {
            const apply = () => { setText(`---\nname: my-creative-skill\ndescription: ${JSON.stringify(purpose.trim())}\n---\n\n${purpose.trim()}\n\n适用范围与约束：${scope.trim()}`); setFiles({}); setPreview(undefined); setFormat(true); };
            if (text) replace(apply); else apply();
          }}/>
        </> : null}
        <ListAction label={format ? '按用途重建草稿' : '直接编辑 SKILL.md'} secondary disabled={busy} onPress={() => setFormat(value => !value)}/>
        {format ? <><Text style={s.label}>SKILL.md 正文</Text><TextInput {...inputFocus} accessibilityLabel="技能文本" value={text} placeholder="粘贴含 name 和 description 的 SKILL.md" onChangeText={value => {setText(value); setPreview(undefined);}} editable={!busy} multiline maxLength={SKILL_BYTES} style={[s.input, {minHeight: 180, textAlignVertical: 'top'}]}/></> : null}
        <ListAction label="填入技能示例" secondary disabled={busy} onPress={() => replace(() => {setText(example); setFiles({}); setPurpose(''); setScope(''); setSource('本地示例'); setFormat(true); setPreview(undefined);})}/>
        {Object.keys(files).filter(path => path !== 'SKILL.md').length ? <Text style={s.muted}>附加文件保留：{Object.keys(files).filter(path => path !== 'SKILL.md').join('、')}</Text> : null}
        <Text style={s.muted}>返回上一步会保留输入；离开添加任务前会确认是否放弃。编辑正文后需要重新检查。</Text>
      </> : null}
      {stage === 'review' && preview ? <>
        <View style={s.card}><Text style={s.label}>{preview.name}</Text><Text style={s.body}>{preview.description}</Text><Text style={s.muted}>{Object.keys(preview.files).length} 个文本文件 · 版本 {preview.id.slice(0, 8)}</Text></View>
        <Text style={s.body}>格式与包内引用检查通过。请审阅用途、范围和限制；选用技能不授予工具、外发或生成权限。</Text>
        {Object.keys(preview.files).map(path => <ListAction key={path} label={`查看文件 ${path}`} secondary disabled={busy} onPress={() => setSelectedFile(path)}/>)}
        <Text accessibilityRole="header" style={s.label}>{selectedFile}</Text><Text selectable style={s.body}>{preview.files[selectedFile]}</Text>
      </> : null}
      {stage === 'installed' && installed ? <>
        <View style={s.card}><Text style={s.label}>{installed.name}</Text><Text style={s.body}>{installed.description}</Text><Text style={s.muted}>版本 {installed.id.slice(0, 8)} 已保存。安装不会自动更改默认选择。</Text></View>
        {threadId ? <>
          {originError ? <Text accessibilityRole="alert" style={s.error}>{originError}</Text> : null}
          <Text style={s.body}>{used ? '已固定为原会话下一条消息的技能。' : '仅用于原会话下一条消息；会替换已有单次选择，不改项目或全局默认。'}</Text>
          <ListAction label={used ? '已用于下次消息' : '用于下次消息'} disabled={busy || used || !origin} onPress={() => void work(async () => {if (!origin) return; await selectNextRunSkills(db, threadId, [installed.id], origin); if (alive.current) setUsed(true);})}/>
          <ListAction label={used ? '返回原会话' : '只安装并返回原会话'} secondary disabled={busy} onPress={onReturn}/>
        </> : null}
        <ListAction label="查看已安装版本" secondary disabled={busy} onPress={() => onDone(installed.id)}/>
      </> : null}
    </KeyboardAwareScrollView>
    {footer ? <View style={s.footer}>{footer}</View> : null}
  </KeyboardSurface>;
}

const s = StyleSheet.create({
  header: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border},
  heading: {flex: 1, fontSize: 18, fontWeight: '600', color: COLORS.text},
  content: {padding: 16, gap: 14, paddingBottom: 24},
  card: {padding: 14, gap: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.surface},
  label: {fontSize: 16, fontWeight: '600', color: COLORS.text},
  body: {fontSize: 14, lineHeight: 22, color: COLORS.text},
  muted: {fontSize: 12, lineHeight: 19, color: COLORS.textMuted},
  error: {fontSize: 14, lineHeight: 22, color: COLORS.danger},
  input: {minHeight: 48, borderWidth: 1, borderColor: COLORS.controlBorder, borderRadius: 8, padding: 12, color: COLORS.text, backgroundColor: COLORS.surface, fontSize: 14},
  footer: {padding: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border},
});
