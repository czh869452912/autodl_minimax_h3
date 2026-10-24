import { useLocalSearchParams } from 'expo-router';
import { CreativeImageDraftRouter } from '../../src/creative/CreativeImageDraftRouter';
export default function ImageDraftRoute() { const { id } = useLocalSearchParams<{id:string}>(); return <CreativeImageDraftRouter id={Array.isArray(id) ? id[0] : id} />; }
