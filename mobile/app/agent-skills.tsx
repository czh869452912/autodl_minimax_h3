import {useLocalSearchParams} from 'expo-router';
import {SkillLibraryScreen} from '../src/agent/skills/SkillLibraryScreen';
export default function AgentSkills(){const {intent,projectId,threadId,returnThreadId,versionId}=useLocalSearchParams<{intent?:string;projectId?:string;threadId?:string;returnThreadId?:string;versionId?:string}>();return <SkillLibraryScreen key={`${projectId??'global'}:${intent??'list'}:${threadId??''}:${returnThreadId??''}:${versionId??''}`} intent={intent} projectId={projectId} threadId={threadId} returnThreadId={returnThreadId} initialVersionId={versionId}/>;}
