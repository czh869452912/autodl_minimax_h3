import { useUnsavedChanges } from '../../creative/useUnsavedChanges';
import { usePrimaryNavigationGuard } from '../../navigation/PrimaryNavigation';
import { CompactWorkbench, IconAction } from '../../creative/WorkbenchUI';
import { COLORS } from '../../ui/theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Pressable, Switch, Text, TextInput, View } from 'react-native';
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

export function SkillLibraryScreen({ onClose, registerLeave, intent }: { intent?:string; onClose?: () => void; registerLeave?:(guard:((proceed:()=>void)=>void)|undefined)=>void } = {}) {
  const router = useRouter();
  const store = useMemo(() => createSkillStore(getDatabase()), []);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof store.runs>>>([]);
  const [advanced,setAdvanced]=useState(false);
  const [purpose,setPurpose]=useState(''),[scope,setScope]=useState('');
  const [text, setText] = useState(''), [preview, setPreview] = useState<SkillPackage>();
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [importOpen,setImportOpen]=useState(intent==='add'),[historyOpen,setHistoryOpen]=useState(false),[expanded,setExpanded]=useState<string>(),[query,setQuery]=useState('');
  const lock = useRef(false);
  const confirmLeave=useUnsavedChanges(Boolean(text.trim() || purpose.trim() || scope.trim() || preview),busy);
  usePrimaryNavigationGuard('agent',confirmLeave,Boolean(onClose));
  const latestLeave=useRef(confirmLeave);latestLeave.current=confirmLeave;
  useEffect(()=>{registerLeave?.(proceed=>latestLeave.current(proceed));return()=>registerLeave?.(undefined);},[registerLeave]);
  const back=()=>confirmLeave(()=>onClose?onClose():router.canGoBack()?router.back():router.replace('/(tabs)/agent'));
  useFallbackBack(back);
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
  const body = <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:6,borderBottomWidth:1,borderColor:COLORS.border}}>
      <IconAction label={onClose ? '关闭技能' : '返回'} icon={onClose ? 'close' : 'arrow_back'} onPress={back}/>
      <Text accessibilityRole="header" style={{flex:1,fontSize:16,fontWeight:'600',color:COLORS.text}}>技能 · {versions.filter(v=>v.enabled).length} 已启用</Text>
      <IconAction label="添加技能" icon="add" onPress={()=>{if(onClose){onClose();router.push({pathname:'/agent-skills',params:{intent:'add'}});}else setImportOpen(!importOpen);}}/>
      <IconAction label="技能运行记录" icon="history" onPress={()=>setHistoryOpen(!historyOpen)}/>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:12,gap:10}}>
      {notice ? <Text accessibilityRole="alert" style={s.body}>{notice}</Text> : null}
      {importOpen && !onClose ? <View style={[s.card,{gap:8}]}>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
          <ListAction label="导入 SKILL.md 或 ZIP" disabled={busy} onPress={()=>void run(pick)}/>
          <ListAction label="从对话提炼技能" secondary disabled={busy} onPress={()=>router.push('/agent-skill-extract')}/>
        </View>
        <Text style={s.body}>先说明技能帮助完成什么，以及适用的场景。安装后仍需单独启用。</Text>
        <Text style={s.body}>用途与适用范围</Text>
        <TextInput accessibilityLabel="技能用途" placeholder="这项技能帮助完成什么" value={purpose} onChangeText={setPurpose} editable={!busy} style={s.input}/>
        <TextInput accessibilityLabel="技能适用范围" placeholder="什么场景使用，有哪些约束" value={scope} onChangeText={setScope} editable={!busy} multiline style={s.input}/>
        <ListAction label="生成可编辑的技能草稿" secondary disabled={busy || !purpose.trim()} onPress={()=>{setText('---\nname: my-creative-skill\ndescription: '+JSON.stringify(purpose.trim())+'\n---\n\n'+purpose.trim()+'\n\n适用范围与约束：'+scope.trim());setAdvanced(true);}}/>
        <ListAction label={advanced?'收起高级格式':'高级：编辑 SKILL.md 格式'} secondary onPress={()=>setAdvanced(!advanced)}/>
        {advanced?<TextInput accessibilityLabel="技能文本" placeholder="也可粘贴 SKILL.md 正文" value={text} onChangeText={setText} editable={!busy} multiline maxLength={SKILL_BYTES} style={[s.input,{minHeight:100,textAlignVertical:'top'}]}/>:null}
        <View style={{flexDirection:'row',gap:6,flexWrap:'wrap'}}>
          <ListAction label="检查粘贴的技能" disabled={busy || !text.trim()} onPress={()=>void run(async()=>{setPreview(validateSkillPackage({'SKILL.md':text}));})}/>
          <ListAction label="填入技能示例" secondary disabled={busy} onPress={()=>{setText(template);setAdvanced(true);}}/>
        </View>
      </View> : null}
      {preview ? <View style={s.card}>
        <Text style={s.title}>{preview.name} · 待安装</Text><Text style={s.body}>{preview.description}</Text>
        <Text selectable style={s.muted}>{preview.files['SKILL.md'].slice(0,4000)}</Text>
        <View style={{flexDirection:'row',gap:6}}>
          <ListAction label="安装此版本" disabled={busy} onPress={()=>void run(async()=>{await store.install(preview);setPreview(undefined);setImportOpen(false);setText('');setPurpose('');setScope('');setNotice('已安装，打开开关后在新对话运行中生效。');})}/>
          <ListAction label="关闭预览" secondary disabled={busy} onPress={()=>setPreview(undefined)}/>
        </View>
      </View> : null}
      <TextInput accessibilityLabel="搜索技能" placeholder="搜索名称或用途" value={query} onChangeText={setQuery} style={s.input}/>
      <Text style={{fontSize:12,color:COLORS.textMuted}}>启用后用于新运行。同名技能只启用一个版本；停用会停止使用该版本的运行。</Text>
      {!versions.length ? <Text style={s.muted}>还没有本地技能，点击右上角 + 导入。内置技能随应用提供。</Text> : null}
      {versions.filter(v=>`${v.name} ${v.description}`.toLowerCase().includes(query.trim().toLowerCase())).map(version=><View key={version.id} style={[s.card,{padding:10,gap:8}]}>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
          <Pressable accessibilityRole="button" accessibilityLabel={`查看 ${version.name} ${version.id.slice(0,8)}`} accessibilityState={{expanded:expanded===version.id}} onPress={()=>setExpanded(expanded===version.id?undefined:version.id)} style={{flex:1,minHeight:44,justifyContent:'center',gap:3}}>
            <Text style={s.title}>{version.name}</Text><Text numberOfLines={expanded===version.id?undefined:2} style={{fontSize:13,lineHeight:18,color:COLORS.textMuted}}>{version.description}</Text>
            <Text style={{fontSize:11,color:COLORS.textMuted}}>{version.id.slice(0,8)} · {expanded===version.id?'收起正文':'查看正文'}</Text>
          </Pressable>
          <Switch accessibilityLabel={`启用 ${version.name} ${version.id.slice(0,8)}`} disabled={busy} value={version.enabled} onValueChange={enabled=>void run(async()=>{if(enabled) await store.enable(version.id);else await store.revoke(version.id);setNotice(enabled?'已启用，将用于新运行。':'已停用，相关运行已请求停止。');})}/>
        </View>
        {expanded===version.id ? <><Text style={s.muted}>{Object.keys(version.files).join(' · ')}</Text><Text selectable style={s.body}>{version.files['SKILL.md']}</Text></> : null}
      </View>)}
      {historyOpen ? <View style={s.card}><Text style={s.title}>最近运行的技能快照</Text>{!runs.length?<Text style={s.muted}>还没有运行记录</Text>:runs.map(item=><Text key={`${item.threadId}:${item.runId}`} selectable style={s.muted}>{item.runId.slice(0,12)} · {item.snapshot.versions.length?item.snapshot.versions.map(ref=>`${versions.find(v=>v.id===ref.id)?.name??'缺失技能'}@${ref.id.slice(0,8)}`).join('、'):'仅内置技能'}</Text>)}</View>:null}
    </ScrollView>
  </KeyboardAvoidingView>;
  return <CompactWorkbench>{onClose ? body : <SafeAreaView style={s.screen}>{body}</SafeAreaView>}</CompactWorkbench>;
}
