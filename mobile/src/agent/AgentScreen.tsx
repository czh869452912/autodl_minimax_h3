import { CopilotChat } from '@copilotkit/react-native/components';
import { CopilotKitProvider } from '@copilotkit/react-native/headless';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { readSettings } from '../settings/storage';
import { COLORS } from '../ui/theme';
import { getAgentHeaders, getCopilotRuntimeUrl } from './copilotConfig';

const AGENT_NAME = 'h3-prompt-assistant';

type AgentConfig = { runtimeUrl: string; accessToken: string };

/** CopilotKit owns chat rendering, streaming, tools, attachments and errors. */
export default function AgentScreen() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void readSettings().then((settings) => {
      if (!active) return;
      try {
        setConfig({
          runtimeUrl: getCopilotRuntimeUrl('android-emulator', settings.agentUrl),
          accessToken: settings.agentAccessToken,
        });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Agent Runtime 地址无效');
      }
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : '无法读取 Agent 设置');
    });
    return () => { active = false; };
  }, []);

  if (error) return <StatusView message={error} />;
  if (!config) return <StatusView loading />;

  return (
    <CopilotKitProvider
      runtimeUrl={config.runtimeUrl}
      headers={() => getAgentHeaders(config.accessToken)}
      onError={({ error: runtimeError }) => setError(runtimeError.message)}
    >
      <CopilotChat
        agentName={AGENT_NAME}
        headerTitle="Prompt 助手"
        placeholder="描述你想生成的视频，助手会整理成 H3 Prompt…"
        emptyStateTitle="把想法交给 H3 Prompt 助手"
        emptyStateSubtitle="官方 H3 skills 与真实工具调用由服务端 DeepAgents 处理。"
        style={styles.chat}
      />
    </CopilotKitProvider>
  );
}

function StatusView({ loading, message }: { loading?: boolean; message?: string }) {
  return (
    <View style={styles.status}>
      {loading ? <ActivityIndicator color={COLORS.primaryActive} /> : null}
      <Text style={styles.statusText}>{message ?? '正在加载 Prompt 助手…'}</Text>
      {!loading ? <Text style={styles.statusHint}>请在设置中检查 Agent Runtime 地址和访问令牌。</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // CopilotKit's rendered component owns its own light message/input theme.
  // Match that surface so its built-in empty state and tool UI keep contrast.
  chat: { flex: 1, backgroundColor: '#FFFFFF' },
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: COLORS.background },
  statusText: { color: COLORS.text, fontSize: 16, textAlign: 'center' },
  statusHint: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },
});
