import React from 'react';
import { act, create } from 'react-test-renderer';
import { CreativeHome } from './CreativeHome';
const mockPush=jest.fn(),mockWrite=jest.fn(async(_value:unknown)=>undefined),mockExecute=jest.fn(async()=>({status:'completed',value:{draftId:'draft'}}));
jest.mock('./creativeIdea',()=>({readCreativeIdea:async()=>({mode:'image',image:'Portrait',video:'Pan'}),writeCreativeIdea:(value:unknown)=>mockWrite(value)}));
jest.mock('./runtime',()=>({creativeService:()=>({drafts:async()=>[],execute:mockExecute})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
test('restores the idea and clears only the transferred description after creating a real draft',async()=>{
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<CreativeHome onLegacyVideo={()=>undefined}/>);});
  expect(tree.root.findByProps({accessibilityLabel:'创作描述'}).props.value).toBe('Portrait');
  await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='进入图片工作台'&&typeof n.props.onPress==='function')[0].props.onPress());
  expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({name:'draft.createImage',payload:expect.objectContaining({input:expect.objectContaining({prompt:'Portrait'})})}),expect.any(String));
  expect(mockWrite).toHaveBeenLastCalledWith({mode:'image',image:'',video:'Pan'});
  expect(mockPush).toHaveBeenCalledWith({pathname:'/image-draft/[id]',params:{id:'draft'}});
 }finally{act(()=>tree.unmount());}
});
