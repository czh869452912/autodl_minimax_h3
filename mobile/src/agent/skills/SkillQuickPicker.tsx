import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Keyboard, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useFocusEffect, useRouter} from 'expo-router';
import {DraggableBottomSheet, SheetScrollView} from '../../ui/DraggableSheet';
import {ListAction} from '../../ui/ListPageUI';
import {COLORS} from '../../ui/theme';
import {AppIcon} from '../../ui/icons';
import {getDatabase} from '../../storage/databaseClient';
import {builtinSkillCatalog} from './builtinCatalog';
import {readNextRunSkills, selectNextRunSkills, type SkillSelectionScope} from './nextRun';
import {skillSelectionEvents} from './selectionEvents';
import {runEvents} from '../runEvents';
import {createSkillStore, type SkillVersion} from './store';

/** A transient choice for the next message. Management never writes this draft. */
export function SkillQuickPicker({threadId, running, onReturn}: {threadId: string; running: boolean; onReturn: () => void}) {
  const router = useRouter();
  const db = useMemo(getDatabase, []);
  const store = useMemo(() => createSkillStore(db), [db]);
  const builtins = useMemo(builtinSkillCatalog, []);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [pending, setPending] = useState<Awaited<ReturnType<typeof readNextRunSkills>>>(null);
  const [scope, setScope] = useState<SkillSelectionScope>();
  const [open, setOpen] = useState(false);
  // undefined = no open editor; null = inherit project; [] = builtin only.
  const [draft, setDraft] = useState<string[] | null | undefined>();
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showBuiltins, setShowBuiltins] = useState(false);
  const openingScope = useRef<SkillSelectionScope | undefined>(undefined);
  const confirmedAtOpen = useRef('null');
  const resume = useRef(false), lock = useRef(false), epoch = useRef(0);
  const refresh = useCallback(async (returningFromManagement = false) => {
    const read = ++epoch.current;
    try {
      if (db !== getDatabase()) throw Error('数据已恢复，请重新打开会话');
      const [binding, execution, next] = await Promise.all([
        db.getFirstAsync<{project_id: string | null; revision: number}>('SELECT project_id,revision FROM creative_agent_scopes WHERE thread_id=?', threadId),
        db.getFirstAsync<{epoch: string}>('SELECT epoch FROM creative_execution_state WHERE id=1'),
        readNextRunSkills(db, threadId),
      ]);
      if (!binding || !execution) throw Error('会话范围不可用，请重新打开会话');
      const items = binding.project_id ? await store.projectList(binding.project_id) : await store.list();
      if (read !== epoch.current) return;
      setVersions(items); setPending(next);
      // Preserve the local draft unless management explicitly committed a new
      // next-message choice (for example, after installing a skill).
      if (returningFromManagement && JSON.stringify(next) !== confirmedAtOpen.current) {
        setDraft(next ? [...next.ids] : null);
        confirmedAtOpen.current = JSON.stringify(next);
      }
      setScope({projectId: binding.project_id, revision: binding.revision, epoch: execution.epoch});
      setReady(true); setError('');
    } catch (reason) {
      if (read === epoch.current) { setReady(false); setError(reason instanceof Error ? reason.message : '技能读取失败，请重试'); }
    }
  }, [db, store, threadId]);
  useFocusEffect(useCallback(() => {
    void refresh(resume.current);
    if (resume.current) { resume.current = false; setOpen(true); }
    return () => { epoch.current++; };
  }, [refresh]));
  useEffect(() => skillSelectionEvents.subscribe(changed => { if (changed === threadId) void refresh(); }), [threadId, refresh]);
  useEffect(() => runEvents.subscribe(event => { if (event.threadId === threadId) void refresh(); }), [threadId, refresh]);
  useEffect(() => () => { epoch.current++; }, []);
  const summary = pending ? pending.valid ? pending.ids.length ? `下次：${pending.ids.map(id => versions.find(v => v.id === id)?.name ?? '版本不可用').join('、')}` : '下次：仅内置技能' : '下次技能已失效，请重新选择' : '技能 · 项目默认';
  const close = () => {
    if (lock.current) return;
    Keyboard.dismiss(); setOpen(false); setDraft(undefined); setError('');
    requestAnimationFrame(onReturn);
  };
  const begin = () => {
    if (!ready || running) return;
    Keyboard.dismiss(); openingScope.current = scope;
    confirmedAtOpen.current = JSON.stringify(pending);
    setDraft(pending ? [...pending.ids] : null); setQuery(''); setError(''); setOpen(true);
  };
  const toggle = (version: SkillVersion) => {
    setError('');
    const ids = draft ?? versions.filter(v => v.enabled).map(v => v.id);
    if (ids.includes(version.id)) { setDraft(ids.filter(id => id !== version.id)); return; }
    // Replacing a version of the same named skill is a single selection.
    const next = ids.filter(id => versions.find(v => v.id === id)?.name !== version.name);
    if (next.length >= 8) { setError('单次最多选择 8 个本地技能'); return; }
    setDraft([...next, version.id]);
  };
  const save = async () => {
    if (lock.current || !ready || running || draft === undefined) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (db !== getDatabase()) throw Error('数据已恢复，请重新打开会话');
      await selectNextRunSkills(db, threadId, draft, openingScope.current);
      lock.current = false; close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试'); }
    finally { lock.current = false; setBusy(false); }
  };
  const needle = query.trim().toLowerCase();
  const visible = versions.filter(v => `${v.name} ${v.description}`.toLowerCase().includes(needle));
  const selected = draft ?? versions.filter(v => v.enabled).map(v => v.id);
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={summary} accessibilityHint={running ? '运行中不能更改下次技能' : '选择下一条消息使用的技能'} accessibilityState={{disabled: running || !ready, expanded: open}} disabled={running || !ready} onPress={begin} style={s.trigger}>
      <AppIcon name="auto_awesome" size={16} color={COLORS.primary}/><Text numberOfLines={1} style={[s.summary, pending?.valid === false && {color: COLORS.danger}]}>{summary}</Text><AppIcon name="expand_more" size={18}/>
    </Pressable>
    {running ? <Text style={s.caption}>运行中，完成后可更改下次技能</Text> : null}
    {!open && error ? <View><Text accessibilityRole="alert" style={s.error}>{error}</Text><ListAction label="重新读取技能" secondary onPress={() => void refresh()}/></View> : null}
    <DraggableBottomSheet visible={open} keyboardAvoidance="layout" title="下次消息技能" onClose={close} footer={<View style={{gap: 4}}>
      <Text accessibilityLiveRegion="polite" style={s.caption}>{draft === null ? '继承项目默认；不修改项目组合' : `已选 ${selected.length}/8 个本地技能${selected.length ? '' : ' · 仅内置技能'}`}</Text>
      <ListAction label="用于下次消息" disabled={busy || running || !ready || draft === undefined || selected.some(id => !versions.some(v => v.id === id))} onPress={() => void save()}/>
    </View>}>
      <SheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 8, paddingBottom: 12}}>
        <Text style={s.caption}>仅影响下一条消息。选用技能不授予工具、外发或生成权限。</Text>
        {pending?.valid === false ? <Text accessibilityRole="alert" style={s.error}>原单次选择已失效。请重新核对并确认。</Text> : null}
        {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
        <Pressable accessibilityRole="radio" accessibilityLabel="使用项目默认技能" accessibilityState={{checked: draft === null, disabled: busy}} disabled={busy} onPress={() => setDraft(null)} style={s.row}><Text style={s.name}>使用项目默认</Text><Text style={s.caption}>{draft === null ? '已选' : '继承组合'}</Text></Pressable>
        <Pressable accessibilityRole="radio" accessibilityLabel="仅使用内置技能" accessibilityState={{checked: Array.isArray(draft) && !draft.length, disabled: busy}} disabled={busy} onPress={() => setDraft([])} style={s.row}><Text style={s.name}>仅内置技能</Text><Text style={s.caption}>{Array.isArray(draft) && !draft.length ? '已选' : '不附加本地技能'}</Text></Pressable>
        <TextInput accessibilityLabel="搜索下次技能" placeholder="搜索名称或用途" value={query} onChangeText={setQuery} editable={!busy} style={s.input}/>
        {visible.map(version => <Pressable key={version.id} accessibilityRole="checkbox" accessibilityLabel={`本次选用 ${version.name} ${version.id.slice(0, 8)}`} accessibilityState={{checked: selected.includes(version.id), disabled: busy}} disabled={busy} onPress={() => toggle(version)} style={[s.row, {alignItems: 'flex-start'}]}>
          <View style={{flex: 1, gap: 3}}><Text style={s.name}>{version.name}</Text><Text numberOfLines={2} style={s.caption}>{version.description}</Text><Text style={s.caption}>本地 · {version.id.slice(0, 8)}</Text></View><AppIcon name={selected.includes(version.id) ? 'check' : 'add'} size={20} color={COLORS.primary}/>
        </Pressable>)}
        {!visible.length ? <Text style={s.caption}>{versions.length ? '没有匹配的本地技能，可换个名称搜索。' : '尚无本地技能；内置技能始终可发现。'}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="查看可发现的内置技能" accessibilityState={{expanded: showBuiltins}} onPress={() => setShowBuiltins(v => !v)} style={s.row}><Text style={s.name}>内置技能 · {builtins.length} 项可发现</Text><AppIcon name={showBuiltins ? 'expand_less' : 'expand_more'} size={20}/></Pressable>
        {showBuiltins ? builtins.filter(v => `${v.displayName} ${v.summary}`.toLowerCase().includes(needle)).map(v => <View key={v.path} style={{gap: 3, paddingVertical: 6}}><Text style={s.name}>{v.displayName}</Text><Text style={s.caption}>{v.summary}</Text><Text style={s.caption}>内置只读 · 可发现不代表本次实际读取</Text></View>) : null}
        <ListAction label="管理技能与项目默认" secondary disabled={busy} onPress={() => {
          Keyboard.dismiss(); resume.current = true; setOpen(false);
          router.push({pathname: '/agent-skills', params: {projectId: scope?.projectId ?? undefined, returnThreadId: threadId}});
        }}/>
      </SheetScrollView>
    </DraggableBottomSheet>
  </View>;
}

const s = StyleSheet.create({
  trigger: {minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12},
  summary: {flexShrink: 1, fontSize: 13, color: COLORS.primaryActive},
  row: {minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border},
  name: {fontSize: 15, lineHeight: 22, color: COLORS.text, flexShrink: 1},
  caption: {fontSize: 13, lineHeight: 20, color: COLORS.textMuted},
  error: {fontSize: 14, lineHeight: 21, color: COLORS.danger},
  input: {minHeight: 48, borderWidth: 1, borderColor: COLORS.controlBorder, borderRadius: 6, padding: 10, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.surface},
});
