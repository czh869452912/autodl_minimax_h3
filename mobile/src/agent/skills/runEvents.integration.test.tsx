import {RUN_LABELS} from '../../conversation/activityLabels';
import {runEvents} from '../runEvents';
import React from 'react';
import {act,create} from 'react-test-renderer';
import {Alert} from 'react-native';
import {createInitializedRealSqliteTestDb} from '../../test/realSqlite';
import {createLocalThreadStore,type LocalThreadSnapshot} from '../threadStore';
import {createSkillStore} from './store';
import {validateSkillPackage} from './package';
import {selectNextRunSkills,readNextRunSkills} from './nextRun';
import {skillSelectionEvents} from './selectionEvents';
import {SkillLibraryScreen} from './SkillLibraryScreen';
import {ListAction} from '../../ui/ListPageUI';
import {IconAction} from '../../creative/WorkbenchUI';
import {endPromptRun,readPromptRuns} from '../runState';
import {SkillRunScreen} from './SkillRunScreen';
let mockDb:ReturnType<typeof createInitializedRealSqliteTestDb>;
jest.mock('../../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('expo-router/react-navigation',()=>({useNavigation:()=>({dispatch:jest.fn()}),usePreventRemove:jest.fn()}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn(),canGoBack:()=>true,back:jest.fn()}),useLocalSearchParams:()=>({threadId:'thread',runId:'run'}),useFocusEffect:(effect:()=>void)=>require('react').useEffect(effect,[effect])}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('expo-file-system',()=>({File:jest.fn()}));
let tree:ReturnType<typeof create>|undefined;
let store:ReturnType<typeof createLocalThreadStore>,skills:ReturnType<typeof createSkillStore>,id:string;
const snapshot=():LocalThreadSnapshot=>({threadId:'thread',messages:[],state:{},createdAt:1,updatedAt:1});
async function accept(){return store.accept(await store.load('thread')??snapshot(),{id:'submission',runId:'run',draftRevision:0,message:{id:'message',role:'user',content:'Review scene'}});}
const output=()=>JSON.stringify(tree!.toJSON());
async function mount(){await act(async()=>{tree=create(<SkillLibraryScreen threadId="thread" onClose={()=>{}}/>);});}
beforeEach(async()=>{mockDb=createInitializedRealSqliteTestDb();mockDb.runSync('INSERT INTO creative_agent_scopes(thread_id,project_id,revision,updated_at) VALUES(?,NULL,0,1)','thread');store=createLocalThreadStore(mockDb as never);skills=createSkillStore(mockDb as never);id=await skills.install(validateSkillPackage({'SKILL.md':'---\nname: review-once\ndescription: Review once\n---\nReview scene.'}));});
afterEach(()=>{if(tree)act(()=>tree!.unmount());tree=undefined;mockDb.close();jest.restoreAllMocks();});

async function history(){await act(async()=>tree!.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录'||n.props.label==='返回来源')!.props.onPress());}
async function finish(status:'completed'|'failed'|'cancelled'){
 const durable=(await store.load('thread'))!;
 await store.save({...durable,state:{...durable.state,h3Runs:readPromptRuns(durable.state).map(run=>endPromptRun(run,status,Date.now()))},updatedAt:Date.now()});
}
test.each(['completed','failed','cancelled'] as const)('open history follows committed %s and agrees with detail',async status=>{
 await selectNextRunSkills(mockDb as never,'thread',[id]);await mount();
 await act(async()=>{await accept();});await history();expect(output()).toContain(RUN_LABELS.queued);
 await act(async()=>{await finish(status);});expect(output()).toContain(RUN_LABELS[status]);expect(output()).not.toContain(RUN_LABELS.queued);
 let detail:ReturnType<typeof create>|undefined;
 try{await act(async()=>{detail=create(<SkillRunScreen/>);});expect(JSON.stringify(detail!.toJSON())).toContain(RUN_LABELS[status]);}finally{if(detail)act(()=>detail!.unmount());}
 await history();await history();expect(output()).toContain(RUN_LABELS[status]);
});
test('failed terminal save retains queued; retry publishes only after commit',async()=>{
 await selectNextRunSkills(mockDb as never,'thread',[id]);await mount();await act(async()=>{await accept();});await history();
 const notify=jest.fn(),unsubscribe=runEvents.subscribe(notify);
 try{
 mockDb.execSync("CREATE TRIGGER reject_save BEFORE UPDATE ON agent_runs BEGIN SELECT RAISE(ABORT,'reject save'); END");
 await act(async()=>{await expect(finish('completed')).rejects.toThrow('reject save');});expect(notify).not.toHaveBeenCalled();expect(output()).toContain(RUN_LABELS.queued);
 mockDb.execSync('DROP TRIGGER reject_save');await act(async()=>{await finish('completed');});expect(output()).toContain(RUN_LABELS.completed);expect(notify).toHaveBeenCalledTimes(1);
 const durable=(await store.load('thread'))!;await act(async()=>{await store.save(durable);await store.save({...durable,messages:[...durable.messages,{id:'stream',role:'assistant',content:'token'}]});});expect(notify).toHaveBeenCalledTimes(1);
 }finally{unsubscribe();}
});
test('history entry reloads current records even without a lifecycle event, preserving draft',async()=>{
 await selectNextRunSkills(mockDb as never,'thread',[id]);await mount();await act(async()=>{await accept();});
 await act(async()=>tree!.root.findAllByType(ListAction).find(n=>n.props.label==='选择下次运行技能')!.props.onPress());
 // Simulate a durable update from a writer outside this store's lifecycle bus.
 const row=mockDb.getFirstSync<{payload_json:string}>('SELECT payload_json FROM agent_runs WHERE thread_id=? AND id=?','thread','run')!;
 const run=JSON.parse(row.payload_json);run.status='completed';mockDb.runSync('UPDATE agent_runs SET payload_json=? WHERE thread_id=? AND id=?',JSON.stringify(run),'thread','run');
 await history();expect(output()).toContain(RUN_LABELS.completed);await history();expect(output()).toContain('正在编辑，尚未保存');
});
test('terminal refresh preserves the historical page and unsaved selection',async()=>{
 for(let i=0;i<22;i++){await selectNextRunSkills(mockDb as never,'thread',[id]);await store.accept(await store.load('thread')??snapshot(),{id:'s'+i,runId:'r'+i,draftRevision:0,message:{id:'m'+i,role:'user',content:'scene'}});}
 await mount();await act(async()=>tree!.root.findAllByType(ListAction).find(n=>n.props.label==='选择下次运行技能')!.props.onPress());await history();
 await act(async()=>tree!.root.findAllByType(ListAction).find(n=>n.props.label==='更早的运行')!.props.onPress());
 const labels=()=>tree!.root.findAllByType(ListAction).map(n=>n.props.label).filter(label=>label.startsWith('查看运行：'));const before=labels();expect(before).toHaveLength(2);
 await act(async()=>{await finish('completed');});expect(labels()).toEqual(before);expect(output()).toContain('最新运行');expect(output()).toContain(RUN_LABELS.completed);await history();expect(output()).toContain('正在编辑，尚未保存');
});
