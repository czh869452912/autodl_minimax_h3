import React from 'react';
import {act,create} from 'react-test-renderer';
import {TaskInboxButton} from './TaskInboxButton';
const mockPush=jest.fn(),mockNavigate=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,navigate:mockNavigate}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:async()=>({n:2,attention:1}),getAllAsync:async()=>[{id:'image-job',status:'RUNNING',input_json:'{"prompt":"A cabin"}',creative:1,created_at:1000,started_at:61000,updated_at:63000}]})}));
test('header exposes active count and opens a compact inbox with direct task navigation',async()=>{
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<TaskInboxButton/>,{createNodeMock:()=>({measureInWindow:(cb:any)=>cb(200,20,36,40)})});});
  const button=tree.root.findAll(n=>n.props.accessibilityLabel==='打开任务中心，2 个任务进行中'&&n.props.onPress)[0];
  act(()=>button.props.onPress());
  expect(mockPush).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('1分00秒');
  expect(JSON.stringify(tree.toJSON())).toContain('执行 ');
  act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='查看任务 image-job'&&n.props.onPress)[0].props.onPress());
  expect(mockPush).toHaveBeenCalledWith({pathname:'/creative-task/[id]',params:{id:'image-job'}});
 }finally{act(()=>tree?.unmount());}
});
