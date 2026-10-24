import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { creativeService } from '../src/creative/runtime';
import type { CreativeDraft } from '../src/creative/drafts';
import { ListAction } from '../src/ui/ListPageUI';
import { COLORS } from '../src/ui/theme';
export default function CreativeDraftList() {
  const router = useRouter(); const [drafts, setDrafts] = useState<CreativeDraft[]>([]); const [error, setError] = useState('');
  useFocusEffect(useCallback(() => { let active = true; void creativeService().drafts().then(rows => { if (active) setDrafts(rows); }).catch(() => setError('草稿读取失败')); return () => { active = false; }; }, []));
  return <SafeAreaView style={{flex:1}}><ScrollView style={{ backgroundColor: COLORS.background }} contentContainerStyle={{ padding: 16, gap: 12 }}>
    <ListAction label="返回创作" secondary onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/create')} />
    <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: '700' }}>创作草稿</Text>
    {error ? <Text>{error}</Text> : null}
    {drafts.map(d => <ListAction key={d.id} label={`${JSON.parse(d.input_json).operation==='upscale'?'图片超分':d.provider_id === 'novelai' ? '图片' : '视频'} · ${d.state === 'SUBMITTED' ? '已提交' : '编辑中'} · ${JSON.parse(d.input_json).prompt?.slice(0, 45) || (JSON.parse(d.input_json).operation==='upscale'?'2× 清晰放大':'新草稿')}`} onPress={() => router.push({ pathname: d.provider_id === 'novelai' ? '/image-draft/[id]' : '/creative-draft/[id]', params: { id: d.id } })} />)}
    {!drafts.length ? <Text>从创作首页开始一张图片或一个视频，草稿会自动保留。</Text> : null}
  </ScrollView></SafeAreaView>;
}
