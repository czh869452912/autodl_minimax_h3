import { useLocalSearchParams } from 'expo-router';
import { ImageDraftScreen } from '../../src/creative/ImageDraftScreen';
export default function ImageDraftRoute() { const { id } = useLocalSearchParams<{id:string}>(); return <ImageDraftScreen id={Array.isArray(id) ? id[0] : id} />; }
