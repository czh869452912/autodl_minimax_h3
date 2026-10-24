import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CreativeWorkspace } from '../../src/creative/CreativeWorkspace';
export default function AssetDetail() {
  const { id, projectId, trash, versionId } = useLocalSearchParams<{ id: string; projectId?: string; trash?: string; versionId?: string }>();
  return <SafeAreaView style={{ flex: 1 }}><CreativeWorkspace key={id} mode="assets" assetId={id} projectId={projectId} initialVersionId={versionId} initialTrash={trash === '1'} /></SafeAreaView>;
}
