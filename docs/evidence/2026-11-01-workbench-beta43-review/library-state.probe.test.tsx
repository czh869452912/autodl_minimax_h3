jest.mock('expo-router/react-navigation',()=>({useNavigation:()=>({dispatch:jest.fn()}),usePreventRemove:jest.fn()}));
import React from 'react';
import {Alert,Text,TextInput} from 'react-native';
import {act,create} from 'react-test-renderer';
import {IconAction} from '../../creative/WorkbenchUI';
import {ListAction} from '../../ui/ListPageUI';
const mockStore={projectList:jest.fn(async()=>[{id:'v',name:'scene-review',description:'review',enabled:true,files:{'SKILL.md':'body'}}]),list:jest.fn(async()=>[]),runs:jest.fn(async()=>[])};
jest.mock('../../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:async()=>({project_id:'project'})})}));
jest.mock('./store',()=>({createSkillStore:()=>mockStore}));
jest.mock('expo-router',()=>({useRouter:()=>({canGoBack:()=>true,back:jest.fn()}),useFocusEffect:(effect:()=>void)=>require('react').useEffect(effect,[effect])}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('expo-file-system',()=>({File:jest.fn()}));
import {SkillLibraryScreen} from './SkillLibraryScreen';

test('review probe: Add hides an already-open draft after a visit to History',async()=>{
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<SkillLibraryScreen projectId="project"/>);});
  const icon=(label:string)=>tree.root.findAllByType(IconAction).find(n=>n.props.label===label)!;
  act(()=>icon('添加技能').props.onPress());
  act(()=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='技能用途')!.props.onChangeText('unfinished draft'));
  act(()=>icon('技能运行记录').props.onPress());
  act(()=>icon('添加技能').props.onPress());
  expect(tree.root.findAllByType(TextInput).filter(n=>n.props.accessibilityLabel==='技能用途')).toHaveLength(0);
  act(()=>icon('添加技能').props.onPress());
  expect(tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='技能用途')!.props.value).toBe('unfinished draft');
 }finally{act(()=>tree?.unmount());}
});

test('review probe: unsaved next-run skill choices bypass the registered leave guard',async()=>{
 let guard:((leave:()=>void)=>void)|undefined,tree!:ReturnType<typeof create>;
 const proceed=jest.fn(),alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 try{
  await act(async()=>{tree=create(<SkillLibraryScreen threadId="thread" registerLeave={next=>{guard=next;}}/>);});
  act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='选择下次运行技能')!.props.onPress());
  act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='本次选用 scene-review')!.props.onPress());
  expect(tree.root.findAllByType(Text).some(n=>n.props.children?.join?.('')==='已选 1/8（空选表示仅内置技能）')).toBe(true);
  act(()=>guard!(proceed));
  expect(proceed).toHaveBeenCalledTimes(1);
  expect(alert).not.toHaveBeenCalled();
  await act(async()=>{tree.unmount();tree=create(<SkillLibraryScreen threadId="thread"/>);});
  expect(tree.root.findAllByType(ListAction).some(n=>n.props.label==='保存单次选择')).toBe(false);
 }finally{act(()=>tree?.unmount());alert.mockRestore();}
});
