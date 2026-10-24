import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { creativeAccounts } from './accountRuntime';
import { ListAction } from '../ui/ListPageUI';
import { COLORS } from '../ui/theme';
import { TextAction } from './WorkbenchUI';

export function CreativeAccountPanel({ provider = 'novelai', compact = false }: { provider?: 'novelai' | 'autodl'; compact?: boolean }) {
  const name = provider === 'novelai' ? 'NovelAI' : 'AutoDL';
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const lock = useRef(false);
  const refresh = async () => { setConnected((await creativeAccounts().list()).some(a => a.provider_id === provider)); setLoaded(true); };
  useFocusEffect(useCallback(() => { let active = true; void Promise.resolve().then(() => creativeAccounts().list()).then(rows => { if (active) { setConnected(rows.some(a => a.provider_id === provider)); setLoaded(true); } }).catch(() => { if (active) { setLoaded(true); setNotice('账号状态读取失败，请重新进入此页'); } }); return () => { active = false; }; }, [provider]));
  const connect = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setNotice('正在验证凭据…');
    try { await creativeAccounts().connect(provider, token.trim()); setToken(''); await refresh(); setExpanded(false); setNotice('账号已连接，可继续生成。'); }
    catch (error) { setNotice(error instanceof Error ? error.message : '连接失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (compact && !expanded) return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: COLORS.textMuted }}>{!loaded ? '正在检查账号…' : connected ? `${name} · ${provider === 'autodl' ? '已绑定' : '已连接'}` : `${name} · 尚未连接`}</Text>
      <TextAction label={connected ? '管理账号' : `连接 ${name}`} icon="key" onPress={() => setExpanded(true)} />
    </View>
    {notice ? <Text accessibilityLiveRegion="polite" style={{ color: COLORS.textMuted }}>{notice}</Text> : null}
  </View>;
  return <View style={{ padding: 16, gap: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16 }}>
    {compact ? <ListAction label="收起账号设置" secondary onPress={() => setExpanded(false)} /> : null}
    <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 18 }}>{name} 创作账号</Text>
    <Text style={{ color: COLORS.textMuted }}>{provider === 'autodl' ? '绑定 ComfyUI API Token。服务未提供只读账号验证接口，此处仅安全绑定凭据，首次生成时由服务商验证有效性。' : '填写 NovelAI 账户设置中创建的持久令牌，验证后保存在设备安全存储中。'}{connected ? ' 已绑定；更换令牌会停止旧授权下尚未发送的生成。' : ''}</Text>
    <TextInput accessibilityLabel={`${name} 令牌`} placeholder={`${name} 令牌`} secureTextEntry autoCapitalize="none" autoCorrect={false} value={token} onChangeText={setToken} style={{ color: COLORS.text, borderColor: COLORS.controlBorder, borderWidth: 1, borderRadius: 8, padding: 12 }} />
    <ListAction label={provider === 'autodl' ? '绑定 AutoDL 凭据' : connected ? '验证并更换令牌' : '验证并连接 NovelAI'} disabled={busy || !token.trim()} onPress={() => void connect()} />
    {connected ? <ListAction label={`断开 ${name} 并撤销授权`} disabled={busy} secondary onPress={() => Alert.alert(`断开 ${name}`, '这将撤销生成授权并移除保存的令牌。已发送的请求无法取消，后续查询也可能需要重新连接原账号。', [{ text: '取消', style: 'cancel' }, { text: '断开', style: 'destructive', onPress: () => {
      if (lock.current) return; lock.current = true; setBusy(true);
      void creativeAccounts().disconnect(provider).then(refresh).then(() => setNotice('已断开连接并撤销授权')).catch(() => setNotice('未能完成断开，请重试')).finally(() => { lock.current = false; setBusy(false); });
    } }])} /> : null}
    <Text style={{ color: COLORS.textMuted }}>授权绑定本次凭据，重新连接后不会沿用旧额度。现有 AutoDL 视频设置独立保留。</Text>
    {notice ? <Text accessibilityLiveRegion="polite" style={{ color: COLORS.text }}>{notice}</Text> : null}
  </View>;
}
