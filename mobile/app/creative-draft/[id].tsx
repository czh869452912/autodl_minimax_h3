import { useLocalSearchParams } from 'expo-router';
import { VideoDraftScreen } from '../../src/creative/VideoDraftScreen';
export default function CreativeDraftRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VideoDraftScreen id={Array.isArray(id) ? id[0] : id} />;
}
