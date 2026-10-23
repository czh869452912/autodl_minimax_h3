import { CreateForm } from '../../src/create/CreateForm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Alert } from 'react-native';
import { ListAction } from '../../src/ui/ListPageUI';
import { creativeService } from '../../src/creative/runtime';
import { createId } from '../../src/ids';

export default function CreateScreen() {
  const router = useRouter();
  const { prompt, draftId } = useLocalSearchParams<{
    prompt?: string | string[];
    draftId?: string | string[];
  }>();
  return (
    <View style={{ flex: 1 }}>
    <View style={{ padding: 12, flexDirection: 'row', gap: 8 }}>
      <ListAction label="NovelAI 图片创作" onPress={() => { void creativeService().execute({ name: 'draft.createImage', payload: {} }, createId()).then(result => { if (result.status === 'completed') router.push({ pathname: '/image-draft/[id]', params: { id: result.value.draftId } }); }).catch(() => Alert.alert('无法创建图片草稿', '请稍后重试')); }} />
      <ListAction label="全部创作草稿" secondary onPress={() => router.push('/creative-drafts')} />
    </View>
    <CreateForm
      initialPrompt={Array.isArray(prompt) ? prompt[0] : prompt || ''}
      draftId={Array.isArray(draftId) ? draftId[0] : draftId}
    />
    </View>
  );
}
