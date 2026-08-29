import { CreateForm } from '../../src/create/CreateForm';
import { useLocalSearchParams } from 'expo-router';

export default function CreateScreen() {
  const { prompt, draftId } = useLocalSearchParams<{
    prompt?: string | string[];
    draftId?: string | string[];
  }>();
  return (
    <CreateForm
      initialPrompt={Array.isArray(prompt) ? prompt[0] : prompt || ''}
      draftId={Array.isArray(draftId) ? draftId[0] : draftId}
    />
  );
}
