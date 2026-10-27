import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { COLORS } from '../ui/theme';
/** A single live indicator at the transcript tail, separate from settled process steps. */
export function RunProgress({ startedAt }: { startedAt?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : undefined;
  return <View accessibilityLabel="助手正在处理" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
    <ActivityIndicator size="small" color={COLORS.primary}/>
    <Text style={{ fontSize: 12, color: COLORS.textMuted }}>正在处理{seconds !== undefined ? ` · ${Math.floor(seconds / 60) ? `${Math.floor(seconds / 60)} 分 ` : ''}${seconds % 60} 秒` : '…'}</Text>
  </View>;
}
