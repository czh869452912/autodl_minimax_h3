import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDatabase } from '../../storage/databaseClient';
import { createLocalThreadStore, type LocalThreadSnapshot } from '../threadStore';
import { readSettings } from '../../settings/storage';
import { toH3AgentConfig } from '../agentConfig';
import { createSkillDraftStore, type SkillDraft } from './draftStore';
import { DRAFT_LIMIT, EVIDENCE_LIMIT, extractSkillDraft, redactSkillEvidence, skillEvidenceText } from './extraction';
import { validateSkillPackage } from './package';
import { ListAction } from '../../ui/ListPageUI';
import { creativeUI as s } from '../../creative/creativeUI';

type Evidence = { id: string; sequence: number; text: string; role: string };
export function SkillExtractionScreen() {
  const router = useRouter();
  const db = useMemo(() => getDatabase(), []);
  const threads = useMemo(() => createLocalThreadStore(db), [db]);
  const store = useMemo(() => createSkillDraftStore(db), [db]);
  const [sessions, setSessions] = useState<LocalThreadSnapshot[]>([]), [sessionPage, setSessionPage] = useState(0);
  const [source, setSource] = useState<string>(), [messages, setMessages] = useState<Evidence[]>([]);
  const [before, setBefore] = useState<number>(), [selected, setSelected] = useState<Record<string, Evidence>>({});
  const [drafts, setDrafts] = useState<SkillDraft[]>([]), [draft, setDraft] = useState<SkillDraft>();
  const [goal, setGoal] = useState(''), [evidence, setEvidence] = useState(''), [content, setContent] = useState('');
  const [reviewed, setReviewed] = useState<SkillDraft>(), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false), alive = useRef(true), request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => { const rows = await store.list(); if (alive.current) setDrafts(rows); }, [store]);
  const work = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    try { await fn(); await refresh(); }
    catch (error) { if (alive.current) setNotice(error instanceof Error ? error.message : '操作失败'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => {
    alive.current = true;
    void Promise.all([threads.listSummaries({ limit: 20 }), store.list()]).then(([rows, saved]) => {
      if (alive.current) { setSessions(rows); setDrafts(saved); }
    }).catch(() => { if (alive.current) setNotice('无法读取本地证据与草稿，请返回后重试'); });
    return () => { alive.current = false; request.current?.abort(); };
  }, [threads, store]);
  const dirty = draft ? goal !== draft.goal || evidence !== draft.evidence || content !== draft.content : !!(goal || evidence || content);
  const back = useCallback(() => {
    const leave = () => { request.current?.abort(); router.canGoBack() ? router.back() : router.replace('/agent-skills'); };
    if (dirty || busy) Alert.alert('离开技能提炼？', '已保存草稿会保留；尚未保存的编辑会丢失，正在进行的提炼会取消。', [{ text: '继续编辑' }, { text: '离开', onPress: leave }]);
    else leave();
  }, [router, dirty, busy]);
  useFocusEffect(useCallback(() => { const listener = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; }); return () => listener.remove(); }, [back]));
  const loadMessages = async (threadId: string, cursor?: number) => {
    // Read only persisted text; never hydrate media, workspace, tools or authorization records.
    const rows = await db.getAllAsync<{ id: string; sequence: number; payload_json: string }>('SELECT m.id,m.sequence,m.payload_json FROM agent_messages m JOIN agent_thread_index i ON i.thread_id=m.thread_id WHERE m.thread_id=? AND i.deleted=0 AND m.sequence<? ORDER BY m.sequence DESC LIMIT 30', threadId, cursor ?? Number.MAX_SAFE_INTEGER);
    const items = rows.map(row => { const message = JSON.parse(row.payload_json); return { id: row.id, sequence: row.sequence, text: skillEvidenceText(message), role: message.role === 'user' ? '用户' : '助手' }; }).filter(item => item.text);
    if (!alive.current) return;
    setSource(threadId); setMessages(items.reverse()); if (!items.length) setNotice('本页没有可提炼的已保存文本。旧会话请先在助手中打开一次。'); setBefore(rows.length === 30 ? rows[rows.length - 1].sequence : undefined);
  };
  const showDraft = (next?: SkillDraft) => { setDraft(next); setGoal(next?.goal ?? ''); setEvidence(next?.evidence ?? ''); setContent(next?.content ?? ''); setReviewed(undefined); setSelected({}); };
  const save = async (nextContent = content) => {
    const saved = await store.save({ goal, evidence, content: nextContent }, draft);
    if (alive.current) { setDraft(saved); setContent(saved.content); }
    return saved;
  };
  const generate = () => work(async () => {
    const controller = new AbortController(); request.current = controller;
    const saved = await save();
    try {
      const config = toH3AgentConfig(await readSettings());
      const text = await extractSkillDraft({ evidence: saved.evidence, goal: saved.goal }, config, controller.signal);
      if (controller.signal.aborted || !alive.current) return;
      const updated = await store.save({ goal: saved.goal, evidence: saved.evidence, content: text }, saved);
      if (alive.current) { showDraft(updated); setNotice('草稿已保存。请逐段审阅、修改适用范围和限制，再检查发布；尚未安装或启用。'); }
    } catch { if (alive.current) setNotice(controller.signal.aborted ? '已取消提炼，已保存的草稿保留。' : '提炼失败，草稿已保留。请检查助手模型配置或缩小证据后重试。'); }
    finally { request.current = null; }
  });
  const locked = busy || !!draft?.publishedVersion;
  return <SafeAreaView style={s.screen}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <ListAction label="返回" secondary onPress={back} />
    <Text accessibilityRole="header" style={s.heading}>从对话提炼技能</Text>
    <Text style={s.muted}>选择已保存的用户或助手文本，检查脱敏证据后发送到当前助手模型。仅提炼文本方法，不运行工具。草稿发布与启用分别确认；跨项目使用前仍需验证适用性。</Text>
    {notice ? <Text accessibilityRole="alert" style={s.body}>{notice}</Text> : null}
    <Text style={s.title}>1. 选择证据</Text>
    {sessions.map(session => <ListAction key={session.threadId} label={`选择对话：${session.customTitle || session.summary?.title || '未命名对话'}`} secondary disabled={locked} onPress={() => void work(() => loadMessages(session.threadId))} />)}
    {sessionPage > 0 ? <ListAction label="较新的对话" secondary disabled={locked} onPress={() => void work(async () => { const page = sessionPage - 1; setSessions(await threads.listSummaries({ limit: 20, offset: page * 20 })); setSessionPage(page); })} /> : null}
    <ListAction label="更多对话" secondary disabled={locked} onPress={() => void work(async () => { const page = sessionPage + 1; const rows = await threads.listSummaries({ limit: 20, offset: page * 20 }); if (rows.length) { setSessions(rows); setSessionPage(page); } else setNotice('没有更多对话'); })} />
    {messages.map(message => {
      const key = `${source}:${message.id}`, chosen = !!selected[key];
      return <View key={key} style={s.card}><Text style={s.muted}>{message.role}</Text><Text selectable style={s.body}>{message.text}</Text><ListAction label={`${chosen ? '取消选择' : '选择'}证据 ${message.id.slice(-8)}`} secondary disabled={locked} onPress={() => {
        if (!chosen && Object.keys(selected).length >= 12) { setNotice('每次最多选择 12 段证据'); return; }
        setSelected(current => { const next = { ...current }; if (chosen) delete next[key]; else next[key] = message; return next; });
      }} /></View>;
    })}
    {source && before != null ? <ListAction label="更早消息" secondary disabled={locked} onPress={() => void work(() => loadMessages(source, before))} /> : null}
    <ListAction label={`整理已选证据（${Object.keys(selected).length} 段）`} disabled={locked || !Object.keys(selected).length} onPress={() => {
      const text = Object.values(selected).map((item, index) => `证据 ${index + 1}（${item.role}）\n${item.text}`).join('\n\n');
      if (text.length > EVIDENCE_LIMIT) { setNotice('所选证据超过 24000 字，请减少选择'); return; }
      setEvidence(text); setReviewed(undefined);
    }} />
    <Text style={s.title}>2. 检查发送内容</Text>
    <Text style={s.muted}>常见密钥、链接、邮箱、手机号和路径已预先遮蔽；仍需自行移除私人信息、人物/项目名称和一次性授权。这里只发送下方目标和证据。</Text>
    <TextInput accessibilityLabel="提炼目标" value={goal} editable={!locked} maxLength={500} placeholder="希望复用的方法及适用范围" style={s.input} onChangeText={value => { setGoal(value); setReviewed(undefined); }} />
    <TextInput accessibilityLabel="待发送的证据" value={evidence} editable={!locked} multiline maxLength={EVIDENCE_LIMIT} style={[s.input, { minHeight: 160, textAlignVertical: 'top' }]} onChangeText={value => { setEvidence(value); setReviewed(undefined); }} />
    <ListAction label="重新脱敏并检查" secondary disabled={locked} onPress={() => { setGoal(redactSkillEvidence(goal)); setEvidence(redactSkillEvidence(evidence)); setContent(redactSkillEvidence(content)); setReviewed(undefined); }} />
    <ListAction label="确认发送证据并生成草稿" disabled={locked || !evidence.trim() || !goal.trim()} onPress={() => void generate()} />
    {busy ? <ListAction label="取消提炼" secondary onPress={() => request.current?.abort()} /> : null}
    <Text style={s.title}>3. 审阅草稿</Text>
    <TextInput accessibilityLabel="技能草稿正文" value={content} editable={!locked} multiline maxLength={DRAFT_LIMIT} style={[s.input, { minHeight: 220, textAlignVertical: 'top' }]} onChangeText={value => { setContent(value); setReviewed(undefined); }} />
    <ListAction label="保存草稿" secondary disabled={locked || !evidence.trim() || !goal.trim()} onPress={() => void work(async () => { await save(); setNotice('草稿已保存，可稍后继续审阅。'); })} />
    <ListAction label="检查待发布版本" disabled={locked || !content.trim()} onPress={() => void work(async () => { validateSkillPackage({ 'SKILL.md': content }); setReviewed(await save()); })} />
    {reviewed && !draft?.publishedVersion ? <View style={s.card}><Text style={s.title}>待发布：{validateSkillPackage({ 'SKILL.md': reviewed.content }).name}</Text><Text selectable style={s.body}>{reviewed.content}</Text><ListAction label="确认审阅并发布此版本" disabled={busy} onPress={() => void work(async () => { await store.publish(reviewed); const saved = (await store.list()).find(item => item.id === reviewed.id); if (saved) showDraft(saved); setNotice('已发布到本地技能库，尚未启用。请在技能库中独立启用。'); })} /></View> : null}
    {draft?.publishedVersion ? <Text style={s.muted}>已发布版本 {draft.publishedVersion.slice(0, 12)}；发布内容保持不变。</Text> : null}
    <ListAction label="打开技能库并选择启用" secondary disabled={busy || dirty} onPress={() => router.push('/agent-skills')} />
    <Text style={s.title}>保存的提炼草稿（最近 50 条）</Text>
    <ListAction label="新建提炼草稿" secondary disabled={busy || dirty} onPress={() => showDraft()} />
    {drafts.map(item => <ListAction key={item.id} label={`${item.publishedVersion ? '查看已发布' : '继续审阅'}：${item.goal}`} secondary disabled={busy || dirty} onPress={() => showDraft(item)} />)}
    {draft ? <ListAction label="删除此提炼草稿" secondary disabled={busy} onPress={() => Alert.alert('删除提炼草稿？', '删除保存的证据和草稿，不会删除原对话或已发布的技能版本。', [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: () => void work(async () => { await store.remove(draft); showDraft(); }) }])} /> : null}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
