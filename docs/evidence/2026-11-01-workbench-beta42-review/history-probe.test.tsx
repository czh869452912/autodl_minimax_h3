jest.mock('expo-router/react-navigation',()=>({useNavigation:()=>({dispatch:jest.fn()}),usePreventRemove:jest.fn()}));
import React from 'react';
import {Text} from 'react-native';
import {act,create} from 'react-test-renderer';
import {IconAction} from '../../creative/WorkbenchUI';
const mockStore={projectList:jest.fn(async()=>[]),list:jest.fn(async()=>[]),runs:jest.fn(async()=>[{threadId:'thread-in-project-B',runId:'FOREIGN-B-RUN',snapshot:{epoch:'test',versions:[]}}])};
jest.mock('../../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:async()=>({project_id:'project-A'})})}));
jest.mock('./store',()=>({createSkillStore:()=>mockStore}));
jest.mock('expo-router',()=>({useRouter:()=>({canGoBack:()=>true,back:jest.fn()}),useFocusEffect:(effect:()=>void)=>require('react').useEffect(effect,[effect])}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('expo-file-system',()=>({File:jest.fn()}));
import {SkillLibraryScreen} from './SkillLibraryScreen';

test('review probe: project A history renders an unscoped project B run without source identification or navigation',async()=>{
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<SkillLibraryScreen projectId="project-A" threadId="thread-A"/>);});
  act(()=>tree.root.findAllByType(IconAction).find(n=>n.props.label==='技能运行记录')!.props.onPress());
  expect(mockStore.projectList).toHaveBeenCalledWith('project-A');
  expect(mockStore.runs.mock.calls.at(-1)).toEqual([]);
  const row=tree.root.findAllByType(Text).find(n=>JSON.stringify(n.props.children).includes('FOREIGN-B-RU'))!;
  expect(row).toBeDefined();
  expect(row.props.onPress).toBeUndefined();
  expect(JSON.stringify(row.props.children)).not.toContain('project-B');
  expect(JSON.stringify(row.props.children)).not.toContain('thread-in-project-B');
 }finally{act(()=>tree?.unmount());}
});
