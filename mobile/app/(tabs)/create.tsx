import { StyleSheet, Text, View } from 'react-native';

export default function CreateScreen() {
  return <View style={styles.container}><Text style={styles.title}>AutoDL H3 视频生成</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', padding: 24, paddingTop: 64 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' },
});
