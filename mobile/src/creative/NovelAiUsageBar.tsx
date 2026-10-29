import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { creativeAccounts } from './accountRuntime';
import { fetchNovelAiUsage, type NovelAiUsage } from './novelAiUsage';
import { IconAction, ParameterSheet, TextAction } from './WorkbenchUI';
import { COLORS } from '../ui/theme';
import { creativeUI as s } from './creativeUI';

export function NovelAiUsageBar({ refreshKey, inline=false,onUsage }: { refreshKey: string;inline?:boolean;onUsage?:(usage:NovelAiUsage|undefined)=>void }) {
  const router = useRouter();
  const [usage, setUsage] = useState<NovelAiUsage>();
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [connected, setConnected] = useState<boolean>(), [open, setOpen] = useState(false), [retry, setRetry] = useState(0);
  useEffect(()=>{const timer=setInterval(()=>setRetry(value=>value+1),45000);return()=>clearInterval(timer);},[]);
  const generation = useRef<string | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    setLoading(true); setError('');onUsage?.(undefined);
    void (async () => {
      const accounts = creativeAccounts();
      const account = (await accounts.list()).find(row => row.provider_id === 'novelai');
      if (!active) return;
      setConnected(Boolean(account));
      if (generation.current !== account?.credential_generation_id) { generation.current = account?.credential_generation_id; setUsage(undefined); }
      if (!account) return;
      const credential = await accounts.resolveExact(account.credential_generation_id);
      if (!active) return;
      if (controller.signal.aborted) throw new Error('用量查询超时');
      const result = await fetchNovelAiUsage(credential.token, controller.signal);
      const current = (await accounts.list()).find(row => row.provider_id === 'novelai');
      if (active) {
        if (current?.credential_generation_id === credential.generationId) {setUsage(result);onUsage?.(result);}
        else { setUsage(undefined); setRetry(value => value + 1); }
      }
    })().catch(() => { if (active) setError('用量刷新失败，请检查网络或账号后重试'); })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [refreshKey, retry,onUsage]));
  const accountSettings = () => { setOpen(false); router.push({ pathname: '/settings-panel', params: { section: 'accounts' } }); };
  const recovery=usage?.limit ? usage.limit.percent>=100?'额度已满，恢复暂停':usage.limit.nextPercentSeconds===null?'恢复时间未提供':usage.limit.nextPercentSeconds===0?'额度恢复当前暂停':`查询时约 ${Math.ceil(usage.limit.nextPercentSeconds/60)} 分钟恢复下一百分点`:'恢复时间未提供';
  const summary = connected === false ? '连接 NovelAI 以查看用量' : usage ? `${usage.anlas === null ? 'Anlas 未提供' : `${usage.anlas.toLocaleString()} Anlas`} · ${usage.limit ? `Limit 剩余 ${usage.limit.percent}%${usage.limit.unavailable ? ' · 暂不可用' : ''}` : 'Limit 未提供'}` : loading ? '正在获取 NovelAI 用量…' : '用量暂不可用';
  if(inline)return <View style={{backgroundColor:COLORS.surface,borderBottomWidth:0.5,borderBottomColor:COLORS.border}}>
    <View style={{flexDirection:'row',alignItems:'center',paddingLeft:10}}><Pressable accessibilityRole="button" accessibilityLabel={summary} accessibilityState={{expanded:open}} onPress={()=>connected===false?accountSettings():setOpen(!open)} style={{flex:1,minHeight:30,justifyContent:'center'}}><Text numberOfLines={1} style={{fontSize:11,color:COLORS.textMuted}}>{summary}{error?' · 待刷新':''} {open?'▴':'▾'}</Text></Pressable><IconAction label="刷新 NovelAI 用量" icon="refresh" disabled={loading} onPress={()=>setRetry(value=>value+1)}/></View>
    {usage?.limit?<View accessibilityRole="progressbar" accessibilityLabel="订阅生成剩余额度" accessibilityValue={{min:0,max:100,now:Math.min(100,usage.limit.percent),text:`${usage.limit.percent}%`}} style={{height:2,backgroundColor:COLORS.border}}><View style={{height:2,width:`${Math.min(100,usage.limit.percent)}%`,backgroundColor:COLORS.primary}} /></View>:null}
    {open?<View style={{paddingHorizontal:10,paddingBottom:6,gap:3}}>{usage?<><Text style={{fontSize:11,color:COLORS.textMuted}}>订阅 Anlas {usage.fixedAnlas??'未知'} · 购买 Anlas {usage.purchasedAnlas??'未知'} · {usage.active?'订阅有效':'订阅未激活'}</Text><Text style={{fontSize:11,color:COLORS.textMuted}}>额外 Limit {usage.limit?.purchasedPercent??'未知'}% · {recovery}</Text></>:null}{error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}<Text style={{fontSize:10,color:COLORS.textMuted}}>余额和 Limit 不代表单次费用。{usage?`更新于 ${new Date(usage.fetchedAt).toLocaleTimeString()}`:''}</Text></View>:null}
  </View>;
  return <>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 36, borderBottomWidth: 0.5, borderBottomColor: COLORS.border }}>
      <View style={{ flex: 1 }}><TextAction label={summary} onPress={() => connected === false ? accountSettings() : setOpen(true)} /></View>
      {error && usage ? <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>待刷新</Text> : null}
      <IconAction label="刷新 NovelAI 用量" icon="refresh" disabled={loading} onPress={() => setRetry(value => value + 1)} />
    </View>
    {open ? <ParameterSheet title="NovelAI 用量" onClose={() => setOpen(false)}>
      {usage ? <>
        <Text style={s.title}>{usage.active ? '订阅有效' : '订阅未激活'} · {({ 0: 'Free', 1: 'Tablet', 2: 'Scroll', 3: 'Opus' } as Record<number, string>)[usage.tier] ?? `Tier ${usage.tier}`}</Text>
        <Text style={s.body}>订阅 Anlas：{usage.fixedAnlas ?? '未提供'} · 购买 Anlas：{usage.purchasedAnlas ?? '未提供'}</Text>
        <Text style={s.body}>生成额度 Limit：{usage.limit ? `${usage.limit.percent}%${usage.limit.unavailable ? '（暂不可用）' : ''}` : '服务端未提供'}</Text>
        {usage.limit ? <><View style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.border, overflow: 'hidden' }}><View style={{ height: 6, width: `${Math.min(100, usage.limit.percent)}%`, backgroundColor: COLORS.primary }} /></View>
          <Text style={s.muted}>额外额度：{usage.limit.purchasedPercent === null ? '未提供' : `${usage.limit.purchasedPercent}%`}</Text>
          <Text style={s.muted}>{recovery}</Text></> : null}
        <Text style={s.muted}>更新于 {new Date(usage.fetchedAt).toLocaleTimeString()}。余额与 Limit 不代表本次生成费用。</Text>
      </> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}{usage ? '，上方为上次成功获取的数据。' : ''}</Text> : null}
      <TextAction label={loading ? '正在刷新…' : '刷新用量'} disabled={loading} onPress={() => setRetry(value => value + 1)} />
      <TextAction label="管理 NovelAI 账号" onPress={accountSettings} />
    </ParameterSheet> : null}
  </>;
}
