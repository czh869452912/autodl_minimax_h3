import {useLocalSearchParams} from 'expo-router';
import {SkillLibraryScreen} from '../src/agent/skills/SkillLibraryScreen';
export default function AgentSkills(){const {intent}=useLocalSearchParams<{intent?:string}>();return <SkillLibraryScreen key={intent??'list'} intent={intent}/>;}
