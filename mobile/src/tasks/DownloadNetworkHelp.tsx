import { useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../ui/theme';
import { hasArtifactNetworkHelp } from '../workflows/executor/artifactErrors';

export function DownloadNetworkHelp({ error }: { error?: string }) {
  const [visible, setVisible] = useState(false);
  if (!hasArtifactNetworkHelp(error)) return null;
  const open = (url: string) => { void Linking.openURL(url).catch(() => Alert.alert('无法打开说明', '请稍后重试，或在代理客户端查阅 DNS 配置帮助。')); };
  const button = { minHeight: 48, justifyContent: 'center' as const, paddingVertical: 8 };
  return <>
    <Pressable accessibilityRole="button" style={button} onPress={() => setVisible(true)}><Text style={{ color: COLORS.primaryActive }}>下载网络排查</Text></Pressable>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }}>
        <ScrollView style={{ maxHeight: '85%', backgroundColor: COLORS.background, borderRadius: 16 }} contentContainerStyle={{ padding: 24, gap: 16 }}>
          <Text accessibilityRole="header" style={{ fontSize: 22, color: COLORS.text }}>下载网络排查</Text>
          <Text>“疑似 Fake-IP”表示下载域名返回了保留地址，不代表已确认 VPN 故障。域名解析失败和普通连接失败也可能由断网或 DNS 服务不可用引起。</Text>
          <Text>使用代理时，请让实际下载域名获得真实 DNS 答案。仅将流量设为 DIRECT 不一定有效。下载可能跳转到动态 CDN，不能只配置 autodl.art。</Text>
          <Text>Mihomo：先检查 fake-ip-filter-mode；blacklist 模式下将实际下载域名加入 fake-ip-filter。whitelist / rule 模式含义不同，请按当前客户端说明调整。</Text>
          <Text>sing-box 1.12+：检查 DNS 规则，使下载域名使用非 FakeIP DNS 服务器。旧版 DNS 配置不同，请查阅对应版本说明。</Text>
          <Text>在代理客户端确认实际失败连接的域名；不要分享带查询参数的完整下载链接。配置生效后返回任务，点击“重试下载”。私有或其他保留地址仍会被拒绝。</Text>
          <Pressable accessibilityRole="link" style={button} onPress={() => open('https://wiki.metacubex.one/config/dns/')}><Text style={{ color: COLORS.primaryActive }}>Mihomo DNS 官方说明</Text></Pressable>
          <Pressable accessibilityRole="link" style={button} onPress={() => open('https://sing-box.sagernet.org/configuration/dns/server/fakeip/')}><Text style={{ color: COLORS.primaryActive }}>sing-box FakeIP 官方说明</Text></Pressable>
          <Text style={{ color: COLORS.textMuted }}>说明更新：2026-09-15</Text>
          <Pressable accessibilityRole="button" style={button} onPress={() => setVisible(false)}><Text>关闭排查说明</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  </>;
}
