import React from 'react';
import {act,create} from 'react-test-renderer';
import {createInitializedRealSqliteTestDb} from '../../test/realSqlite';
import {createLocalThreadStore,type LocalThreadSnapshot} from '../threadStore';
import {createSkillStore} from './store';
import {selectNextRunSkills} from './nextRun';
import {SkillLibraryScreen} from './SkillLibraryScreen';
import {SkillRunScreen} from './SkillRunScreen';
import {IconAction} from '../../creative/WorkbenchUI';
import {ListAction} from '../../ui/ListPageUI';
import {endPromptRun,readPromptRuns} from '../runState';
import {runEvents} from '../runEvents';
import {createPromptRuntimeRegistry} from '../runtimeStore';
import {H3AgUiAgent} from '../aguiAgent';
jest.mock(require.resolve('uuid',{paths:[require.resolve('@ag-ui/client')]}),()=>({v4:()=> 'review-generated-id'}));
let mockDb:ReturnType<typeof createInitializedRealSqliteTestDb>;
let mockRunId='run';
jest.mock('../../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('expo-router/react-navigation',()=>({useNavigation:()=>({dispatch:jest.fn()}),usePreventRemove:jest.fn()}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn(),canGoBack:()=>true,back:jest.fn()}),useLocalSearchParams:()=>({threadId:'thread',runId:mockRunId}),useFocusEffect:(effect:()=>void)=>require('react').useEffect(effect,[effect])}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('expo-file-system',()=>({File:jest.fn()}));
let tree:ReturnType<typeof create>|undefined;
let store:ReturnType<typeof createLocalThreadStore>;
const snapshot=():LocalThreadSnapshot=>({threadId:'thread',messages:[],state:{},createdAt:1,updatedAt:1});
const output=(component:typeof SkillLibraryScreen|typeof SkillRunScreen)=>JSON.stringify(tree!.root.findByType(component).findAllByType(require('react-native').Text).map(node=>node.props.children));
const screens=(detailKey='detail')=><><SkillLibraryScreen key="list" threadId="thread" onClose={()=>{}}/><SkillRunScreen key={detailKey}/></>;
async function history(){await act(async()=>tree!.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.onPress());}
beforeEach(async()=>{mockRunId='run';mockDb=createInitializedRealSqliteTestDb();mockDb.runSync('INSERT INTO creative_agent_scopes(thread_id,project_id,revision,updated_at) VALUES(?,NULL,0,1)','thread');store=createLocalThreadStore(mockDb as never);await selectNextRunSkills(mockDb as never,'thread',[]);await store.accept(snapshot(),{id:'submission',runId:'run',draftRevision:0,message:{id:'question',role:'user',content:'Review scene'}});});
afterEach(()=>{if(tree)act(()=>tree!.unmount());tree=undefined;mockDb.close();});

test.each(['completed','failed','cancelled'] as const)('detail opened before %s updates status, messages and errors with history',async status=>{
 await act(async()=>{tree=create(screens());});await history();
 expect(output(SkillRunScreen)).toContain('queued');
 const durable=(await store.load('thread'))!;
 const runs=readPromptRuns(durable.state).map(run=>({...endPromptRun(run,status,Date.now(),status==='failed'?'review-final-error':undefined),messageIds:['answer'],tools:[{id:'tool',name:'review',status:'complete' as const,startedAt:1,endedAt:2,output:'review-tool-output'}]}));
 await act(async()=>{await store.save({...durable,messages:[...durable.messages,{id:'answer',role:'assistant',content:'review-final-output'}],state:{...durable.state,h3Runs:runs},updatedAt:Date.now()});});
 expect((await createSkillStore(mockDb as never).runs({threadId:'thread'}))[0].status).toBe(status);
 expect(output(SkillLibraryScreen)).toContain(status);expect(output(SkillLibraryScreen)).not.toContain('queued');
 expect(output(SkillRunScreen)).toContain(status);expect(output(SkillRunScreen)).toContain('review-final-output');
 await act(async()=>tree!.root.findAllByType(ListAction).find(n=>n.props.label==='查看原会话全部消息')!.props.onPress());
 expect(output(SkillRunScreen)).toContain(status);expect(output(SkillRunScreen)).toContain('review-final-output');
 await act(async()=>tree!.update(screens()));expect(output(SkillRunScreen)).toContain(status);
 expect(tree!.root.findAllByType(ListAction).some(n=>n.props.label==='仅看此运行消息')).toBe(true);
 await act(async()=>tree!.update(screens('reopened-detail')));
 expect(output(SkillRunScreen)).toContain(status);expect(output(SkillRunScreen)).toContain('review-final-output');
 expect(output(SkillRunScreen)).toContain('review-tool-output');
 if(status==='failed')expect(output(SkillRunScreen)).toContain('review-final-error');
});

test('recovery publishes interrupted only after commit and updates the mounted history',async()=>{
 await act(async()=>{tree=create(screens());});await history();const observed=jest.fn();const unsubscribe=runEvents.subscribe(observed);
 try{
  await act(async()=>{await store.recoverInterruptedRuns([]);});
  expect(output(SkillLibraryScreen)).toContain('interrupted');expect(output(SkillRunScreen)).toContain('interrupted');
  expect((await createSkillStore(mockDb as never).runs({threadId:'thread'}))[0].status).toBe('interrupted');
  expect(observed).toHaveBeenCalledWith({threadId:'thread',kind:'status-changed'});
  observed.mockClear();await act(async()=>{await store.recoverInterruptedRuns([]);});expect(observed).not.toHaveBeenCalled();
 }finally{unsubscribe();}
});

test('actual local AGUI/runtime completion updates open detail and history',async()=>{
 mockRunId='live-run';let release!:()=>void,started!:()=>void;
 const began=new Promise<void>(resolve=>{started=resolve;});
 const graph={stream:async function*(){started();await new Promise<void>(resolve=>{release=resolve;});yield [{id:'live-answer',type:'ai',content:'live-final-output'},{}];}};
 const registry=createPromptRuntimeRegistry(()=>new H3AgUiAgent(graph));
 const runtime=registry.ensure({apiKey:'test',endpoint:'https://invalid.test',model:'test',timeoutMs:1000,maxRetries:0},(await store.load('thread'))!,store);
 let completion:Promise<unknown>|undefined;
 try{
  await runtime.accept({id:'live-submission',runId:'live-run',draftRevision:0,message:{id:'live-question',role:'user',content:'Review live scene'}});
  // The custom offline graph bypasses createSkillRunPreparer; capture its normal skill snapshot explicitly.
  await createSkillStore(mockDb as never).capture('thread','live-run');
  completion=runtime.agent.runAgent({runId:'live-run'});await began;await registry.flushAll();
  await act(async()=>{tree=create(screens());});await history();expect(output(SkillRunScreen)).toContain('running');
  await act(async()=>{release();await completion;await registry.flushAll();});
  const persisted=(await store.load('thread'))!;expect(readPromptRuns(persisted.state).find(run=>run.id==='live-run')?.status).toBe('completed');
  expect(JSON.stringify(persisted.messages)).toContain('live-final-output');expect(output(SkillLibraryScreen)).toContain('completed');
  expect(output(SkillRunScreen)).toContain('completed');expect(output(SkillRunScreen)).toContain('live-final-output');
 }finally{release?.();await completion?.catch(()=>{});await registry.disposeAll();}
});
