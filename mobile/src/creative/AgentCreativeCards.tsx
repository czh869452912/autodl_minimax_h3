import { useCallback, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getDatabase } from '../storage/databaseClient';
import { creativeService } from './runtime';
import { creativeAccounts, creativeBudget } from './accountRuntime';
import type { CreativeDraft } from './drafts';
import { ListAction } from '../ui/ListPageUI';
import { creativeUI as s } from './creativeUI';
import { creativeJobLabel } from './CreativeResults';
import { VersionThumbnail } from './VersionThumbnail';

type Card = { id: string; name: string; draft?: CreativeDraft; jobId?: string; status?: string; projectId?: string; versionId?: string };
export function AgentCreativeCards({ threadId, running }: { threadId: string; running: boolean }) {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [allowance, setAllowance] = useState<Record<string, number>>({});
  useFocusEffect(useCallback(() => {
    let active = true, reading = false;
    const refresh = async () => {
      if (reading) return; reading = true;
      try {
        const db = getDatabase();
        const receipts = await db.getAllAsync<{ id: string; command_name: string; result_json: string }>('SELECT r.id,r.command_name,r.result_json FROM creative_command_receipts r JOIN creative_execution_origins o ON o.id=r.execution_origin_id WHERE o.thread_id=? ORDER BY r.created_at DESC LIMIT 20', threadId);
        const scope = await db.getFirstAsync<{ project_id: string }>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?', threadId);
        const next: Card[] = []; const seen = new Set<string>();
        for (const row of receipts) {
          const r = JSON.parse(row.result_json);
          const jobId = r.execution?.kind === 'generation' ? r.execution.jobId : undefined;
          const draft = r.value?.draftId ? await creativeService().draft(r.value.draftId) : jobId ? await db.getFirstAsync<CreativeDraft>('SELECT * FROM creative_generation_drafts WHERE job_id=?', jobId) : null;
          if (draft && draft.state !== 'DISCARDED' && draft.project_id === scope?.project_id && !seen.has(draft.id)) {
            seen.add(draft.id);
            const job = draft.job_id ? await db.getFirstAsync<{ status: string }>('SELECT status FROM workflow_jobs WHERE id=?', draft.job_id) : null;
            const output = draft.job_id ? await db.getFirstAsync<{ version_id: string }>('SELECT version_id FROM creative_output_links WHERE job_id=? LIMIT 1', draft.job_id) : null;
            next.push({ id: row.id, name: draft.provider_id === 'novelai' ? '图片创作' : '视频创作', draft, jobId: draft.job_id ?? undefined, status: job?.status, versionId: output?.version_id });
          } else if ((r.value?.planId || r.value?.proposalId) && scope?.project_id) {
            const object = r.value.planId
              ? await db.getFirstAsync<{ project_id: string; state: string }>('SELECT project_id,state FROM creative_plans WHERE id=?', r.value.planId)
              : await db.getFirstAsync<{ project_id: string; state: string }>('SELECT project_id,state FROM creative_change_proposals WHERE id=?', r.value.proposalId);
            if (object?.project_id === scope.project_id && ['ACTIVE', 'WAITING'].includes(object.state)) next.push({ id: row.id, name: r.value.planId ? '选图与后续制作' : '修改建议待审阅', projectId: object.project_id });
          }
        }
        const allowance: Record<string, number> = scope?.project_id ? { novelai: await creativeBudget().availableUnknownRequests(scope.project_id, 'novelai'), autodl: await creativeBudget().availableUnknownRequests(scope.project_id, 'autodl') } : {};
        if (active) { setCards(next.slice(0, 5).reverse()); setAllowance(allowance); }
      } finally { reading = false; }
    };
    void refresh().catch(() => { if (active) setError('创作卡片读取失败'); });
    const timer = setInterval(() => void refresh().catch(() => undefined), 2500);
    return () => { active = false; clearInterval(timer); };
  }, [threadId]));
  const grant = async (draft: CreativeDraft) => {
    if (!draft.project_id || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const release = () => { lock.current = false; setBusy(false); };
    try {
      const provider = draft.provider_id === 'novelai' ? 'novelai' : 'autodl';
      const scope = await getDatabase().getFirstAsync<{ project_id: string }>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?', threadId);
      if (scope?.project_id !== draft.project_id) throw new Error('当前项目已切换，请查看当前项目的草稿');
      const account = (await creativeAccounts().list()).find(a => a.provider_id === provider);
      if (!account) throw new Error('请先打开草稿连接生成账号');
      if (await creativeBudget().availableUnknownRequests(draft.project_id, provider) > 0) { setNotice('当前项目已有可用授权，可以让助手继续。无需重复授权。'); release(); return; }
      Alert.alert('允许助手继续生成', `允许当前项目最多 1 次${provider === 'novelai' ? '图片' : '视频'}请求，15 分钟有效。费用未知，没有金额上限。授权适用于此项目，不仅限于这份草稿。`, [
        { text: '取消', style: 'cancel', onPress: release },
        { text: '授权 1 次', onPress: () => void (async () => {
          const scope = await getDatabase().getFirstAsync<{ project_id: string }>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?', threadId);
          if (scope?.project_id !== draft.project_id) throw new Error('项目范围已改变，请重新确认');
          if (await creativeBudget().availableUnknownRequests(draft.project_id!, provider) > 0) return;
          await creativeBudget().grant({ provider, generationId: account.credential_generation_id, projectId: draft.project_id!, operations: [provider === 'novelai' ? 'image.generate' : 'video.generate'], requestLimit: 1, amountLimit: null, allowUnknownCost: true, maxUnknownRequests: 1, expiresAt: Date.now() + 15 * 60000 }); })().then(() => setNotice('已授权。发送“按当前草稿继续”让助手执行；手动编辑仍使用同一草稿。')).catch(e => setError(e.message)).finally(release) },
      ], { cancelable: false });
    } catch (e) { setError(e instanceof Error ? e.message : '授权失败'); release(); }
  };
  if (!cards.length && !error) return null;
  return <View style={{ gap: 12, padding: 12 }}>
    <Text style={s.title}>本会话的创作</Text>
    {cards.map(card => <View key={card.id} style={s.card}>
      <Text style={s.title}>{card.name}</Text>
      {card.draft ? <>
        <Text style={s.body} numberOfLines={3}>{JSON.parse(card.draft.input_json).prompt || '待补充描述'}</Text>
        <Text style={s.muted}>{card.status ? creativeJobLabel(card.status) : card.draft.state === 'EDITING' ? '草稿已保存 · 可手动接管' : card.draft.state === 'DISCARDED' ? '草稿已丢弃' : '已提交'}</Text>
        {card.versionId && card.draft.provider_id === 'novelai' ? <VersionThumbnail versionId={card.versionId} /> : null}
        <ListAction label={card.draft.state === 'EDITING' ? '编辑这份草稿' : '查看成果与进度'} secondary onPress={() => router.push({ pathname: card.draft!.provider_id === 'novelai' ? '/image-draft/[id]' : '/creative-draft/[id]', params: { id: card.draft!.id } })} />
        {card.draft.state === 'EDITING' ? <ListAction label={allowance[card.draft.provider_id] ? `本项目可用授权 ${allowance[card.draft.provider_id]} 次` : "授权本项目 1 次生成"} secondary disabled={busy || running || Boolean(allowance[card.draft.provider_id])} onPress={() => void grant(card.draft!)} /> : null}
      </> : <ListAction label="查看并处理" onPress={() => router.push({ pathname: '/creative-project/[id]', params: { id: card.projectId!, tab: card.name.includes('修改') ? 'activity' : 'plans' } })} />}
    </View>)}
    {notice ? <Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </View>;
}
