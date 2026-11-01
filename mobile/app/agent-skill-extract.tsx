import {useLocalSearchParams} from 'expo-router';
import {SkillExtractionScreen} from '../src/agent/skills/SkillExtractionScreen';
export default function SkillExtract(){const params=useLocalSearchParams<{projectId?:string;threadId?:string}>();return <SkillExtractionScreen {...params}/>;}
