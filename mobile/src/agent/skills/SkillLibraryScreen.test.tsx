const mockReadNext=jest.fn(async()=>null as any),mockSelectNext=jest.fn(async()=>{});
jest.mock('./nextRun',()=>({readNextRunSkills:(...args:unknown[])=>mockReadNext(...args as []),selectNextRunSkills:(...args:unknown[])=>mockSelectNext(...args as [])}));
jest.mock('expo-router/react-navigation',()=>({useNavigation:()=>({dispatch:jest.fn()}),usePreventRemove:jest.fn()}));
import { Alert, TextInput, Switch } from 'react-native';
import { IconAction } from '../../creative/WorkbenchUI';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { ListAction } from '../../ui/ListPageUI';
const mockPush=jest.fn();
const mockStore = { projectList:jest.fn(async (_id:string)=>[] as any[]),setProjectVersion:jest.fn(async (_project:string,_name:string,_version:string|null|undefined)=>{}), list: jest.fn(async () => [] as any[]), runs: jest.fn(async (..._args:any[]) => [] as any[]), install: jest.fn(async () => 'id'), enable: jest.fn(async () => {}), revoke: jest.fn(async () => {}) };
jest.mock('../../storage/databaseClient', () => ({ getDatabase: () => ({getFirstAsync:async()=>({project_id:'trusted-project'})}) }));
jest.mock('./store', () => ({ createSkillStore: () => mockStore }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push:mockPush,canGoBack: () => true, back: jest.fn() }), useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
import { SkillLibraryScreen } from './SkillLibraryScreen';

test('review and install do not enable a skill until the user selects its version', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<SkillLibraryScreen />); });
  const click = async (label: string) => { await act(async () => tree.root.findAllByType(ListAction).find(node => node.props.label === label)!.props.onPress()); };
  act(()=>tree.root.findAllByType(IconAction).find(n=>n.props.label==='添加技能')!.props.onPress());
  await click('填入技能示例'); await click('检查粘贴的技能');
  expect(mockStore.install).not.toHaveBeenCalled(); expect(mockStore.enable).not.toHaveBeenCalled();
  mockStore.install.mockImplementationOnce(async (pkg?: any) => { mockStore.list.mockResolvedValue([{ ...pkg, createdAt: 1, revocation: 0, enabled: false }]); return pkg.id; });
  await click('安装此版本'); expect(mockStore.enable).not.toHaveBeenCalled();
  const action = tree.root.findByType(Switch);
  await act(async () => action.props.onValueChange(true)); expect(mockStore.enable).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
  await act(async () => tree.unmount());
});


test('switching off revokes the selected version and blocks duplicate writes while saving',async()=>{
 mockStore.revoke.mockClear();
 mockStore.list.mockResolvedValue([{id:'enabled-version',name:'Review',description:'Review scenes',enabled:true,files:{'SKILL.md':'Review'},createdAt:1,revocation:0}]);
 let finish!:()=>void;mockStore.revoke.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
 let tree!:ReturnType<typeof create>;
 await act(async()=>{tree=create(<SkillLibraryScreen/>);});
 const toggle=tree.root.findByType(Switch);
 act(()=>{toggle.props.onValueChange(false);toggle.props.onValueChange(false);});
 expect(mockStore.revoke).toHaveBeenCalledTimes(1);
 expect(mockStore.revoke).toHaveBeenCalledWith('enabled-version');
 expect(tree.root.findByType(Switch).props.disabled).toBe(true);
 await act(async()=>finish());
 expect(tree.root.findByType(Switch).props.disabled).toBe(false);
 act(()=>tree.unmount());
});


test('context changes share the unsaved import guard',async()=>{
 let guard:((proceed:()=>void)=>void)|undefined;
 const proceed=jest.fn(),alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<SkillLibraryScreen registerLeave={value=>{guard=value;}}/>);});
  act(()=>tree.root.findAllByType(IconAction).find(n=>n.props.label==='添加技能')!.props.onPress());
  act(()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='技能用途')!.props.onChangeText('unfinished skill'));
  act(()=>guard!(proceed));
  expect(proceed).not.toHaveBeenCalled();
  expect(alert).toHaveBeenLastCalledWith('尚有未保存的修改',expect.any(String),expect.any(Array));
  act(()=>alert.mock.calls.at(-1)![2]!.find(c=>c.text==='放弃修改')!.onPress!());
  expect(proceed).toHaveBeenCalledTimes(1);
 }finally{act(()=>tree?.unmount());alert.mockRestore();}
 expect(guard).toBeUndefined();
});


test('project switches update only project selection and never globally revoke a skill',async()=>{
 mockStore.projectList.mockResolvedValue([{id:'version',name:'scene-review',description:'Review',enabled:true,projectOverride:true,files:{'SKILL.md':'body'}}]);
 mockStore.revoke.mockClear();mockStore.enable.mockClear();mockStore.setProjectVersion.mockClear();
 let tree!:ReturnType<typeof create>;try{
  await act(async()=>{tree=create(<SkillLibraryScreen projectId="project"/>);});
  await act(async()=>tree.root.findByType(Switch).props.onValueChange(false));
  expect(mockStore.setProjectVersion).toHaveBeenCalledWith('project','scene-review',null);
  expect(mockStore.revoke).not.toHaveBeenCalled();expect(mockStore.enable).not.toHaveBeenCalled();
  await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='恢复全局选择')!.props.onPress());
  expect(mockStore.setProjectVersion).toHaveBeenCalledWith('project','scene-review',undefined);
 }finally{act(()=>tree.unmount());}
});

test('thread panel uses persisted project scope and disables only that project',async()=>{
 mockStore.projectList.mockResolvedValue([{id:'v',name:'skill',description:'test',enabled:true,files:{'SKILL.md':'body'}}]);mockStore.revoke.mockClear();
 let tree!:ReturnType<typeof create>;await act(async()=>{tree=create(<SkillLibraryScreen projectId="wrong-route" threadId="thread"/>);});
 expect(mockStore.projectList).toHaveBeenLastCalledWith('trusted-project');
 await act(async()=>tree.root.findByType(Switch).props.onValueChange(false));
 expect(mockStore.setProjectVersion).toHaveBeenLastCalledWith('trusted-project','skill',null);expect(mockStore.revoke).not.toHaveBeenCalled();act(()=>tree.unmount());
});


test('history uses trusted thread scope and opens exact historical run without changing selection',async()=>{
 mockStore.runs.mockResolvedValue([{threadId:'thread',runId:'old-run',createdAt:1,projectTitle:'可信项目',threadTitle:'原会话',status:'completed',skillNames:{old:'历史名称'},snapshot:{versions:[{id:'old'}]}}]);
 mockStore.setProjectVersion.mockClear();let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<SkillLibraryScreen threadId="thread" projectId="wrong"/>);});
 expect(mockStore.runs).toHaveBeenLastCalledWith(expect.objectContaining({threadId:'thread',limit:21}));
 act(()=>tree.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.onPress());
 expect(JSON.stringify(tree.toJSON())).toContain('历史名称');
 act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='查看运行 old-run')!.props.onPress());
 expect(mockPush).toHaveBeenLastCalledWith({pathname:'/agent-run',params:{threadId:'thread',runId:'old-run'}});
 expect(mockStore.setProjectVersion).not.toHaveBeenCalled();
 }finally{act(()=>tree.unmount());mockStore.runs.mockResolvedValue([]);}
});


test('history is an immediate view and local filter does not require traversing builtin cards',async()=>{
 mockStore.runs.mockResolvedValue([]);mockStore.list.mockResolvedValue([{id:'local',name:'my-local',description:'本地用途',enabled:false,files:{'SKILL.md':'body'}}]);let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<SkillLibraryScreen/>);});
 expect(JSON.stringify(tree.toJSON())).toContain('品牌宣传短片生成器');expect(JSON.stringify(tree.toJSON())).not.toContain('包指纹');
 act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='本地导入'&&n.props.onPress)[0].props.onPress());
 expect(JSON.stringify(tree.toJSON())).toContain('my-local');expect(JSON.stringify(tree.toJSON())).not.toContain('品牌宣传短片生成器');
 act(()=>tree.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.onPress());
 expect(tree.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.selected).toBe(true);
 expect(JSON.stringify(tree.toJSON())).toContain('还没有运行记录');expect(tree.root.findAllByProps({accessibilityLabel:'搜索技能'})).toHaveLength(0);
 act(()=>tree.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.onPress());
 act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='内置技能'&&n.props.onPress)[0].props.onPress());
 const builtin=()=>tree.root.findAll(n=>n.props.accessibilityLabel==='内置：品牌宣传短片生成器'&&n.props.onPress)[0];
 act(()=>builtin().props.onPress());expect(builtin().props.accessibilityState.expanded).toBe(true);expect(JSON.stringify(tree.toJSON())).toContain('包指纹');
 }finally{act(()=>tree.unmount());}
});


test('add from history reveals the import form immediately',async()=>{
 let tree!:ReturnType<typeof create>;try{await act(async()=>{tree=create(<SkillLibraryScreen/>);});
 act(()=>tree.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.onPress());
 act(()=>tree.root.findAllByType(IconAction).find(n=>n.props.label==='添加技能')!.props.onPress());
 expect(tree.root.findAllByProps({accessibilityLabel:'技能用途'}).length).toBeGreaterThan(0);
 expect(tree.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.selected).toBe(false);
 }finally{act(()=>tree.unmount());}
});


test.each([false,true])('unsaved once selection (selected=%s) is guarded and never auto-saved',async(selected)=>{
 mockSelectNext.mockClear();mockReadNext.mockResolvedValue(null);mockStore.projectList.mockResolvedValue([{id:'v',name:'local',description:'test',files:{'SKILL.md':'body'},enabled:true}]);
 let guard:((proceed:()=>void)=>void)|undefined,tree!:ReturnType<typeof create>;const proceed=jest.fn(),alert=jest.spyOn(Alert,'alert');
 try{await act(async()=>{tree=create(<SkillLibraryScreen threadId="t" registerLeave={value=>{guard=value;}}/>);});
 const click=(label:string)=>tree.root.findAllByType(ListAction).find(n=>n.props.label===label)!.props.onPress();
 act(()=>click('选择下次运行技能'));if(selected)act(()=>click('本次选用 local'));
 act(()=>guard!(proceed));expect(proceed).not.toHaveBeenCalled();expect(alert).toHaveBeenCalledWith('尚有未保存的修改',expect.any(String),expect.any(Array));
 act(()=>alert.mock.calls.at(-1)![2]!.find(v=>v.text==='继续编辑')?.onPress?.());expect(JSON.stringify(tree.toJSON())).toContain('正在编辑，尚未保存');expect(mockSelectNext).not.toHaveBeenCalled();
 act(()=>alert.mock.calls.at(-1)![2]!.find(v=>v.text==='放弃修改')!.onPress!());expect(proceed).toHaveBeenCalledTimes(1);
 }finally{act(()=>tree.unmount());alert.mockRestore();}
});
test('reads persisted once override separately from the unsaved editor',async()=>{
 mockReadNext.mockResolvedValue({ids:[],valid:true});let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<SkillLibraryScreen threadId="t"/>);});expect(JSON.stringify(tree.toJSON())).toContain('已固定，等待下一条消息消费');expect(JSON.stringify(tree.toJSON())).not.toContain('正在编辑，尚未保存');}finally{act(()=>tree.unmount());mockReadNext.mockResolvedValue(null);}
});
