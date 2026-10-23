import { useEffect, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { creativeAccounts } from './accountRuntime';
import { ListAction } from '../ui/ListPageUI';
import { COLORS } from '../ui/theme';

export function CreativeAccountPanel({ provider = 'novelai' }: { provider?: 'novelai' | 'autodl' }) {
  const name = provider === 'novelai' ? 'NovelAI' : 'AutoDL';
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const refresh = async () => setConnected((await creativeAccounts().list()).some(a => a.provider_id === provider));
  useEffect(() => { void refresh().catch(() => undefined); }, []);
  const connect = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setNotice('正在验证凭据…');
    try { await creativeAccounts().connect(provider, token.trim()); setToken(''); await refresh(); setNotice('凭据已安全保存；生成时将单独确认授权范围。'); }
    catch (error) { setNotice(error instanceof Error ? error.message : '连接失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={{ padding: 16, gap: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16 }}>
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
