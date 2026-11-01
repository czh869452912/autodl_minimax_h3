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
async function mount(registerLeave?:React.ComponentProps<typeof SkillLibraryScreen>['registerLeave']){await act(async()=>{tree=create(<SkillLibraryScreen threadId="thread" onClose={()=>{}} registerLeave={registerLeave}/>);});}
beforeEach(async()=>{mockDb=createInitializedRealSqliteTestDb();mockDb.runSync('INSERT INTO creative_agent_scopes(thread_id,project_id,revision,updated_at) VALUES(?,NULL,0,1)','thread');store=createLocalThreadStore(mockDb as never);skills=createSkillStore(mockDb as never);id=await skills.install(validateSkillPackage({'SKILL.md':'---\nname: review-once\ndescription: Review once\n---\nReview scene.'}));});
afterEach(()=>{if(tree)act(()=>tree!.unmount());tree=undefined;mockDb.close();jest.restoreAllMocks();});

test('a delayed old pending read cannot restore a consumed override after the commit refresh',async()=>{
 await selectNextRunSkills(mockDb as never,'thread',[id]);await mount();
 const original=mockDb.getFirstAsync.bind(mockDb);let held=false,release:(()=>void)|undefined;
 const read=jest.spyOn(mockDb,'getFirstAsync').mockImplementation(async(sql:string,...params:unknown[])=>{
  const value=await original(sql,...params);
  if(sql==='SELECT * FROM agent_skill_next_runs WHERE thread_id=?'&&!held){held=true;await new Promise<void>(resolve=>{release=resolve;});}
  return value;
 });
 await act(async()=>skillSelectionEvents.publish('thread'));
 expect(release).toBeDefined();
 await act(async()=>{await accept();});
 expect(output()).toContain('当前使用项目组合，没有单次覆盖');
 await act(async()=>release!());
 expect(output()).toContain('当前使用项目组合，没有单次覆盖');expect(output()).not.toContain('已固定，等待下一条消息消费');
 read.mockRestore();expect(await readNextRunSkills(mockDb as never,'thread')).toBeNull();
});

test('observer failure cannot turn a committed submission into failure or clear an unsaved empty editor',async()=>{
 const unsubscribe=skillSelectionEvents.subscribe(()=>{throw Error('observer failed');});
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});let guard:((proceed:()=>void)=>void)|undefined;
 try{
  await selectNextRunSkills(mockDb as never,'thread',[id]);await mount(value=>{guard=value;});
  await act(async()=>tree!.root.findAllByType(ListAction).find(n=>n.props.label==='选择下次运行技能')!.props.onPress());
  await act(async()=>tree!.root.findAllByType(ListAction).find(n=>n.props.label==='✓ 本次选用 review-once')!.props.onPress());
  expect(output()).toContain('正在编辑，尚未保存');
  await act(async()=>{await expect(accept()).resolves.toMatchObject({runId:'run'});});
  expect(output()).toContain('当前使用项目组合，没有单次覆盖');expect(output()).toContain('正在编辑，尚未保存');
  expect(tree!.root.findAllByType(ListAction).some(n=>n.props.label==='✓ 本次选用 review-once')).toBe(false);
  const proceed=jest.fn();act(()=>guard!(proceed));expect(proceed).not.toHaveBeenCalled();expect(alert).toHaveBeenCalledWith('尚有未保存的修改',expect.any(String),expect.any(Array));
  expect((await skills.capture('thread','run')).versions.map(v=>v.id)).toEqual([id]);
 }finally{unsubscribe();}
});

test.each(['completed','failed','cancelled'] as const)('review reproduction: history remains queued after durable %s, while evidence reads the current state',async status=>{
 await selectNextRunSkills(mockDb as never,'thread',[id]);await mount();
 await act(async()=>{await accept();});
 const durable=(await store.load('thread'))!;
 await act(async()=>{await store.save({...durable,state:{...durable.state,h3Runs:readPromptRuns(durable.state).map(run=>endPromptRun(run,status,Date.now()))},updatedAt:Date.now()});});
 expect((await skills.runs({threadId:'thread'}))[0].status).toBe(status);
 await act(async()=>tree!.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.onPress());
 expect(output()).toContain('queued');expect(output()).not.toContain(status);
 let detail:ReturnType<typeof create>|undefined;
 try{await act(async()=>{detail=create(<SkillRunScreen/>);});expect(JSON.stringify(detail!.toJSON())).toContain(status);expect(JSON.stringify(detail!.toJSON())).not.toContain('queued');}finally{if(detail)act(()=>detail!.unmount());}
 // Repeated view switching and ordinary parent rerender do not invalidate the cache.
 await act(async()=>tree!.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.onPress());
 await act(async()=>tree!.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.onPress());
 await act(async()=>tree!.update(<SkillLibraryScreen threadId="thread" onClose={()=>{}}/>));
 expect(output()).toContain('queued');expect(output()).not.toContain(status);
 await act(async()=>tree!.unmount());tree=undefined;await mount();
 await act(async()=>tree!.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.onPress());
 expect(output()).toContain(status);expect(output()).not.toContain('queued');
});
