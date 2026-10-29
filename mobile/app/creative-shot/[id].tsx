import {useLocalSearchParams} from 'expo-router';
import {ShotOutputReview} from '../../src/creative/ShotOutputReview';
export default function ShotOutputRoute(){
 const params=useLocalSearchParams<{id:string;projectId:string}>();
 return <ShotOutputReview key={JSON.stringify(params)} shotId={params.id} projectId={params.projectId}/>;
}
