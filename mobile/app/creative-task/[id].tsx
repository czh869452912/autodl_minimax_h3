import {TaskTiming} from '../../src/tasks/TaskCardRow';
import { useCallback, useState } from 'react';
import { Alert,Linking,ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getDatabase } from '../../src/storage/databaseClient';
import { createJobRepository } from '../../src/jobs/repository';
import type { JobRecord } from '../../src/jobs/types';
import type { CreativeDraft } from '../../src/creative/drafts';
import { CreativeResults, creativeJobLabel } from '../../src/creative/CreativeResults';
import { creativeUI as s } from '../../src/creative/creativeUI';
import { CompactWorkbench, IconAction, TextAction as ListAction } from '../../src/creative/WorkbenchUI';
import {acknowledgeUnknownTask,unknownTaskReviewed} from '../../src/creative/taskRecovery';
import { getTaskServices } from '../../src/tasks/taskServices';
import { taskProviderPresentation } from '../../src/tasks/providerPresentation';

export default function CreativeTask() {
  const { id, returnToWorkbench } = useLocalSearchParams<{ id: string; returnToWorkbench?:string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobRecord>();
  const [draft, setDraft] = useState<CreativeDraft | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewed,setReviewed]=useState(false);
  const [busy,setBusy]=useState(false);
  const provider=taskProviderPresentation(job?.adapterId);
  const returnToDraft=()=>{if(!draft)return;if(returnToWorkbench==='1'&&router.canGoBack())router.back();else router.replace({pathname:draft.provider_id==='novelai'?'/image-draft/[id]':'/creative-draft/[id]',params:{id:draft.id}});};
  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      const db = getDatabase(); const job = await createJobRepository(db).get(id);
      const draft = await db.getFirstAsync<CreativeDraft>('SELECT * FROM creative_generation_drafts WHERE job_id=?', id);
      const reviewed=await unknownTaskReviewed(db,id);
      if (active) { setReviewed(reviewed);setJob(job); setDraft(draft); setError(job ? '' : '未找到此任务，原记录可能已移除'); }
    };
    void load().catch(() => setError('读取任务失败'));
    const timer = setInterval(() => void load().catch(() => undefined), 2500);
    return () => { active = false; clearInterval(timer); };
  }, [id]));
  return <CompactWorkbench><SafeAreaView style={s.screen}><View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:8}}><IconAction label="返回" icon="arrow_back" onPress={()=>router.canGoBack()?router.back():router.replace('/(tabs)/tasks')}/><Text style={s.title}>任务与结果</Text></View><ScrollView contentContainerStyle={s.content}>
    {draft?.target_asset_id?<CreativeResults draft={draft} taskDetail/>:null}
    {job ? <View style={s.card}>
      <Text accessibilityLiveRegion="polite" style={s.title}>{creativeJobLabel(job.status)}</Text>
      <Text numberOfLines={2} style={s.body}>{String(job.inputSnapshot.prompt ?? job.inputSnapshot.input ?? '创作任务')}</Text>
      <Text style={s.muted}>{new Date(job.createdAt).toLocaleString()}</Text><TaskTiming compact task={{...job,status:job.status==='SUCCEEDED'?'SUCCESS':job.status==='PARTIAL_SUCCEEDED'?'PARTIAL_SUCCESS':['FAILED','CANCELLED','UNKNOWN','RUNNING'].includes(job.status)?job.status as 'FAILED'|'CANCELLED'|'UNKNOWN'|'RUNNING':'QUEUED'}}/>
      {job.error || job.lastError ? <Text style={s.error}>{/^(PROVIDER_SUBMIT_UNKNOWN|SUBMIT_OUTCOME_UNKNOWN)$/.test(job.lastError?.code??job.error?.code??'')?'上一次提交未取得确认，暂时无法判断服务端是否已受理。':job.error?.message ?? job.lastError?.message}</Text> : null}
      {job.providerHandle?<Text selectable style={s.muted}>服务端任务：{String(job.providerHandle.providerJobId??'已接收')}</Text>:null}
      {job.status==='UNKNOWN'?<>
        <Text style={s.muted}>{job.providerHandle?'原任务可能仍在执行，可同步状态并对照服务端记录。':provider.reviewHint}</Text>
        {provider.reviewUrl?<ListAction label={`打开 ${provider.name} 核查`} onPress={()=>void Linking.openURL(provider.reviewUrl!).catch(()=>setError(`无法打开 ${provider.name}，请在浏览器核查生成记录`))}/>:null}
        {draft?.provider_id==='novelai'&&!reviewed?<ListAction label="已核查，解除本次等待" disabled={busy} onPress={()=>Alert.alert('继续新的尝试？',`请确认已核查 ${provider.name} 原任务。原任务结果和消费记录会保留；继续创作可能产生新的费用。本操作只解除工作台等待，生成仍需你点击。`,[{text:'继续核查',style:'cancel'},{text:'已核查，继续创作',onPress:()=>{setBusy(true);void acknowledgeUnknownTask(getDatabase(),id).then(()=>{setReviewed(true);setNotice('已解除工作台等待，原任务记录已保留');}).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}])}/>:null}
        {draft?.provider_id!=='novelai'?<Text style={s.muted}>可返回工作台继续提交新视频；原任务仍会保留并继续核查。</Text>:null}
      {reviewed?<Text style={s.muted}>已完成本次核查，可返回工作台调整输入并重新生成。原任务结果仍待确认。</Text>:null}
      </>:null}
      {job.providerHandle&&!['SUCCEEDED','PARTIAL_SUCCEEDED','FAILED','CANCELLED'].includes(job.status)?<ListAction label="同步任务状态" onPress={()=>void getTaskServices().taskCommandService.requestRefresh({maintenance:'force-next-slice'}).then(()=>setNotice('已请求查询，不会重新生成')).catch(e=>setError(e.message))}/>:null}
      {/CREDENTIAL|AUTH/.test(job.lastError?.code??job.error?.code??'')?<ListAction label="管理创作账号" onPress={()=>router.push({pathname:'/(tabs)/settings',params:{section:'accounts'}})}/>:null}
    </View> : null}
    {draft ? <ListAction label="返回创作与结果" onPress={returnToDraft} /> : null}
    <ListAction label="打开任务中心处理下载或异常" onPress={() => router.push('/(tabs)/tasks')} />
    {notice ? <Text style={s.muted}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </ScrollView></SafeAreaView></CompactWorkbench>;
}
