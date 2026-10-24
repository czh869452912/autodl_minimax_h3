import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CreateForm } from '../../src/create/CreateForm';
import { ListAction } from '../../src/ui/ListPageUI';
import { CreativeHome } from '../../src/creative/CreativeHome';

export default function CreateScreen() {
  const { prompt, draftId } = useLocalSearchParams<{ prompt?: string | string[]; draftId?: string | string[] }>();
  const [legacy, setLegacy] = useState(Boolean(prompt || draftId));
  useEffect(() => { if (prompt || draftId) setLegacy(true); }, [prompt, draftId]);
  if (!legacy) return <CreativeHome onLegacyVideo={() => setLegacy(true)} />;
  return <View style={{ flex: 1 }}>
    <View style={{ padding: 12 }}><ListAction label="返回创作首页" secondary onPress={() => setLegacy(false)} /></View>
    <CreateForm initialPrompt={Array.isArray(prompt) ? prompt[0] : prompt || ''} draftId={Array.isArray(draftId) ? draftId[0] : draftId} />
  </View>;
}
