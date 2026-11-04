import {useLocalSearchParams} from 'expo-router';
import {SkillLibraryScreen} from '../src/agent/skills/SkillLibraryScreen';
export default function AgentSkills(){const {intent,projectId,threadId,returnThreadId}=useLocalSearchParams<{intent?:string;projectId?:string;threadId?:string;returnThreadId?:string}>();return <SkillLibraryScreen key={`${projectId??'global'}:${intent??'list'}:${threadId??''}:${returnThreadId??''}`} intent={intent} projectId={projectId} threadId={threadId} returnThreadId={returnThreadId}/>;}
