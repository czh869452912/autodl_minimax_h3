import { CreateForm } from '../../src/create/CreateForm';
import { useLocalSearchParams } from 'expo-router';

export default function CreateScreen() {
  const { prompt } = useLocalSearchParams<{ prompt?: string | string[] }>();
  return <CreateForm initialPrompt={Array.isArray(prompt) ? prompt[0] : prompt || ''} />;
}
