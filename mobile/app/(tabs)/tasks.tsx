import { StyleSheet, Text, View } from 'react-native';

export default function TasksScreen() {
  return <View style={styles.container}><Text style={styles.title}>任务队列</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', padding: 24, paddingTop: 64 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' },
});
