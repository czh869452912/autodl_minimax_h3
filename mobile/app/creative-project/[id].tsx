import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CreativeWorkspace } from '../../src/creative/CreativeWorkspace';
export default function ProjectDetail() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  return <SafeAreaView style={{ flex: 1 }}><CreativeWorkspace key={id} mode="projects" projectId={id} initialTab={tab} /></SafeAreaView>;
}
