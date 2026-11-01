import {useLocalSearchParams} from 'expo-router';
import {SkillLibraryScreen} from '../src/agent/skills/SkillLibraryScreen';
export default function AgentSkills(){const {intent,projectId,threadId}=useLocalSearchParams<{intent?:string;projectId?:string;threadId?:string}>();return <SkillLibraryScreen key={`${projectId??'global'}:${intent??'list'}`} intent={intent} projectId={projectId} threadId={threadId}/>;}
