import React from 'react';
import {act,create} from 'react-test-renderer';
import {createInitializedRealSqliteTestDb} from '../../test/realSqlite';
import {createLocalThreadStore, type LocalThreadSnapshot} from '../threadStore';
import {createSkillStore} from './store';
import {validateSkillPackage} from './package';
import {selectNextRunSkills,readNextRunSkills} from './nextRun';
import {skillSelectionEvents} from './selectionEvents';
import {SkillLibraryScreen} from './SkillLibraryScreen';
import {ListAction} from '../../ui/ListPageUI';
import {IconAction} from '../../creative/WorkbenchUI';
import {Composer} from '../PromptAssistantUi';
import {ConversationSend} from '../../conversation/ConversationInput';
let mockDb:ReturnType<typeof createInitializedRealSqliteTestDb>;
jest.mock('../../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('expo-router/react-navigation',()=>({useNavigation:()=>({dispatch:jest.fn()}),usePreventRemove:jest.fn()}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn(),canGoBack:()=>true,back:jest.fn()}),useFocusEffect:(effect:()=>void)=>require('react').useEffect(effect,[effect])}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('expo-file-system',()=>({File:jest.fn()}));
jest.mock('expo-clipboard',()=>({setStringAsync:jest.fn()}));
jest.mock('@copilotkit/react-native',()=>({useCopilotChatContext:jest.fn()}));
jest.mock('@copilotkit/react-native/components',()=>({CopilotMarkdown:()=>null}));
jest.mock('@copilotkit/shared',()=>({getSourceUrl:()=>''}));
jest.mock('../../ui/icons',()=>({AppIcon:()=>null}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View,useSafeAreaInsets:()=>({top:0,right:0,bottom:0,left:0})}));
let tree:ReturnType<typeof create>|undefined;
let store:ReturnType<typeof createLocalThreadStore>, skills:ReturnType<typeof createSkillStore>, id:string;
const snapshot=():LocalThreadSnapshot=>({threadId:'thread',messages:[],state:{},createdAt:1,updatedAt:1});
async function accept(runId:string,retryOf?:string){return store.accept(await store.load('thread')??snapshot(),{id:'submit-'+runId,runId,draftRevision:0,message:{id:'message-'+runId,role:'user',content:'Review this scene'},retryOf});}
const output=()=>JSON.stringify(tree!.toJSON());
async function click(label:string){await act(async()=>{tree!.root.findAllByType(ListAction).find(n=>n.props.label===label)!.props.onPress();});}
async function mount(){await act(async()=>{tree=create(<SkillLibraryScreen threadId="thread" onClose={()=>{}}/>);});}
beforeEach(async()=>{mockDb=createInitializedRealSqliteTestDb();mockDb.runSync('INSERT INTO creative_agent_scopes(thread_id,project_id,revision,updated_at) VALUES(?,NULL,0,1)','thread');store=createLocalThreadStore(mockDb as never);skills=createSkillStore(mockDb as never);id=await skills.install(validateSkillPackage({'SKILL.md':'---\nname: once\ndescription: Once only\n---\nReview the scene.'}));});
afterEach(()=>{if(tree)act(()=>tree!.unmount());tree=undefined;mockDb.close();});
test.each([false,true])('mounted panel follows committed acceptance, including empty override=%s',async empty=>{
 await selectNextRunSkills(mockDb as never,'thread',empty?[]:[id]);await mount();expect(output()).toContain('已固定，等待下一条消息消费');
 await act(async()=>{await accept('run');});expect(output()).toContain('当前使用项目组合，没有单次覆盖');expect(output()).not.toContain('已固定，等待下一条消息消费');
 expect(await readNextRunSkills(mockDb as never,'thread')).toBeNull();expect((await skills.capture('thread','run')).versions.map(v=>v.id)).toEqual(empty?[]:[id]);
 await click('选择下次运行技能');expect(tree!.root.findAllByType(ListAction).some(n=>n.props.label==='✓ 本次选用 once')).toBe(false);
 await act(async()=>tree!.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.onPress());expect(output()).toContain('查看运行：');
 await act(async()=>{await accept('second');});expect((await skills.capture('thread','second')).versions).toEqual([]);
});
test('rollback keeps saved override and emits no commit event',async()=>{
 await selectNextRunSkills(mockDb as never,'thread',[id]);await mount();const notified=jest.fn(),unsubscribe=skillSelectionEvents.subscribe(notified);
 try{mockDb.execSync("CREATE TRIGGER reject_submission BEFORE INSERT ON agent_submissions BEGIN SELECT RAISE(ABORT,'reject submission'); END");
 await act(async()=>{await expect(accept('failed')).rejects.toThrow('reject submission');});expect(notified).not.toHaveBeenCalled();expect(output()).toContain('已固定，等待下一条消息消费');
 expect(await readNextRunSkills(mockDb as never,'thread')).toEqual({ids:[id],valid:true});expect(mockDb.getAllSync('SELECT * FROM agent_skill_runs')).toEqual([]);
 }finally{unsubscribe();}
});
test('retry uses original snapshot without consuming newly saved override',async()=>{
 await selectNextRunSkills(mockDb as never,'thread',[id]);await accept('original');await selectNextRunSkills(mockDb as never,'thread',[]);await mount();
 await act(async()=>{await accept('retry','original');});expect((await skills.capture('thread','retry')).versions.map(v=>v.id)).toEqual([id]);expect(await readNextRunSkills(mockDb as never,'thread')).toEqual({ids:[],valid:true});expect(output()).toContain('已固定，等待下一条消息消费');
});
test('background refresh preserves unsaved choices and ignores other threads',async()=>{
 await selectNextRunSkills(mockDb as never,'thread',[id]);await mount();await click('选择下次运行技能');const reads=jest.spyOn(mockDb,'getFirstAsync');reads.mockClear();
 await act(async()=>skillSelectionEvents.publish('other'));expect(reads).not.toHaveBeenCalled();
 await act(async()=>{await accept('run');});expect(output()).toContain('当前使用项目组合，没有单次覆盖');expect(output()).toContain('正在编辑，尚未保存');expect(tree!.root.findAllByType(ListAction).some(n=>n.props.label==='✓ 本次选用 once')).toBe(true);reads.mockRestore();
});
test('actual Composer send updates still-mounted panel through real acceptance',async()=>{
 await selectNextRunSkills(mockDb as never,'thread',[id]);let accepted:Promise<unknown>|undefined;
 // Real UI and durable acceptance; no model or network is started.
 await act(async()=>{tree=create(<><SkillLibraryScreen threadId="thread" onClose={()=>{}}/><Composer value="Review this scene" onChangeText={()=>{}} onSubmit={()=>{accepted=accept('composer');}} onOpenPicker={async()=>{}} onCancel={()=>{}} isRunning={false} attachments={[]}/></>);});
 const panel=tree!.root.findByType(SkillLibraryScreen);expect(output()).toContain('已固定，等待下一条消息消费');
 await act(async()=>{tree!.root.findByType(ConversationSend).props.onSend();await accepted;});expect(accepted).toBeDefined();expect(tree!.root.findByType(SkillLibraryScreen)).toBe(panel);expect(output()).toContain('当前使用项目组合，没有单次覆盖');expect((await skills.capture('thread','composer')).versions.map(v=>v.id)).toEqual([id]);
});
