import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CreativeWorkspace } from '../../src/creative/CreativeWorkspace';
export default function ProjectDetail() {
  const { id, tab, shotId } = useLocalSearchParams<{ id: string; tab?: string; shotId?:string }>();
  return <SafeAreaView style={{ flex: 1 }}><CreativeWorkspace key={id} mode="projects" projectId={id} initialTab={tab} initialShotId={shotId} /></SafeAreaView>;
}
