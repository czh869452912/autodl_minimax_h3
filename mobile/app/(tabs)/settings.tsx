import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { readSettings, saveSettings } from '../../src/settings/storage';

export default function SettingsScreen() {
  const [values, setValues] = useState({ token: '', apiKey: '', endpoint: 'https://api.minimaxi.com/v1', model: 'MiniMax-M2.7' });
  useEffect(() => { void readSettings().then(setValues); }, []);
  const update = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const save = async () => { await saveSettings(values); Alert.alert('已保存', '密钥已使用 Android Keystore 加密存储。'); };
  return <View style={styles.container}><Text style={styles.title}>设置</Text><Text style={styles.subtitle}>配置 AutoDL 和 Prompt Assistant，密钥不写入源码。</Text>{[['token','AutoDL ComfyUI Token'],['apiKey','LLM API Key'],['endpoint','LLM API Endpoint'],['model','LLM Model']].map(([key,label]) => <View key={key} style={styles.group}><Text style={styles.label}>{label}</Text><TextInput secureTextEntry={key === 'token' || key === 'apiKey'} value={values[key as keyof typeof values]} onChangeText={(text) => update(key as keyof typeof values, text)} style={styles.input} /></View>)}<Pressable onPress={() => void save()} style={styles.button}><Text style={styles.buttonText}>保存设置</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', padding: 24, paddingTop: 64 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#94a3b8', marginTop: 8, marginBottom: 28 }, group: { marginBottom: 18 }, label: { color: '#94a3b8', fontSize: 12, marginBottom: 8 }, input: { backgroundColor: '#0f172a', color: '#e2e8f0', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', paddingHorizontal: 14, paddingVertical: 12 }, button: { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 }, buttonText: { color: '#fff', fontWeight: '700' },
});
