import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getDatabase } from '../../src/storage/databaseClient';
import { createJobRepository } from '../../src/jobs/repository';
import type { JobRecord } from '../../src/jobs/types';
import type { CreativeDraft } from '../../src/creative/drafts';
import { creativeJobLabel } from '../../src/creative/CreativeResults';
import { creativeUI as s } from '../../src/creative/creativeUI';
import { ListAction } from '../../src/ui/ListPageUI';
import { getTaskServices } from '../../src/tasks/taskServices';

export default function CreativeTask() {
  const { id, returnToWorkbench } = useLocalSearchParams<{ id: string; returnToWorkbench?:string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobRecord>();
  const [draft, setDraft] = useState<CreativeDraft | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      const db = getDatabase(); const job = await createJobRepository(db).get(id);
      const draft = await db.getFirstAsync<CreativeDraft>('SELECT * FROM creative_generation_drafts WHERE job_id=?', id);
      if (active) { setJob(job); setDraft(draft); setError(job ? '' : '未找到此任务，原记录可能已移除'); }
    };
    void load().catch(() => setError('读取任务失败'));
    const timer = setInterval(() => void load().catch(() => undefined), 2500);
    return () => { active = false; clearInterval(timer); };
  }, [id]));
  return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content}>
    <ListAction label="返回" secondary onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/tasks')} />
    <Text accessibilityRole="header" style={s.heading}>本次生成</Text>
    {job ? <View style={s.card}>
      <Text accessibilityLiveRegion="polite" style={s.title}>{creativeJobLabel(job.status)}</Text>
      <Text style={s.body}>{String(job.inputSnapshot.prompt ?? job.inputSnapshot.input ?? '创作任务')}</Text>
      <Text style={s.muted}>{new Date(job.createdAt).toLocaleString()}</Text>
      {job.error || job.lastError ? <Text style={s.error}>{job.error?.message ?? job.lastError?.message}</Text> : null}
      {job.status === 'UNKNOWN' ? <Text style={s.muted}>请先核查原任务，当前页面不会重新提交生成。</Text> : null}
      <ListAction label="同步任务状态" secondary onPress={() => void getTaskServices().taskCommandService.requestRefresh({ maintenance: 'force-next-slice' }).then(() => setNotice('已请求同步任务中心状态，不会重新生成')).catch(e => setError(e.message))} />
    </View> : null}
    {draft ? <ListAction label="返回创作与结果" onPress={() => returnToWorkbench==='1' && router.canGoBack() ? router.back() : router.replace({ pathname: draft.provider_id === 'novelai' ? '/image-draft/[id]' : '/creative-draft/[id]', params: { id: draft.id } })} /> : null}
    <ListAction label="打开任务中心处理下载或异常" secondary onPress={() => router.push('/(tabs)/tasks')} />
    {notice ? <Text style={s.muted}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </ScrollView></SafeAreaView>;
}
