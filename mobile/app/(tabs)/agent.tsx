import { StyleSheet, Text, View } from 'react-native';

export default function AgentScreen() {
  return <View style={styles.container}><Text style={styles.title}>Prompt 助手</Text><Text style={styles.body}>assistant-ui Native runtime 接入位。</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', padding: 24, paddingTop: 64 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' },
  body: { color: '#94a3b8', marginTop: 12 },
});
