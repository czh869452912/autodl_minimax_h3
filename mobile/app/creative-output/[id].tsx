import { useLocalSearchParams } from 'expo-router';
import { CreativeOutputPreview } from '../../src/creative/CreativeOutputPreview';

export default function CreativeOutputRoute() {
  const params = useLocalSearchParams<{ id: string; assetId: string; jobId: string; draftId: string }>();
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const target = { versionId: first(params.id) ?? '', assetId: first(params.assetId) ?? '', jobId: first(params.jobId) ?? '', draftId: first(params.draftId) ?? '' };
  return <CreativeOutputPreview key={JSON.stringify(target)} {...target} />;
}
