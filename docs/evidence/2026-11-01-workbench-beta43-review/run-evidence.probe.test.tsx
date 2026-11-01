import React from 'react';
import {Image} from 'react-native';
import {act,create} from 'react-test-renderer';
import {ListAction} from '../../ui/ListPageUI';
import {normalizeMessages} from '../agentPresentation';
const mockLoad=jest.fn();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({threadId:'thread',runId:'run'})}));
jest.mock('../../navigation/useSourceBack',()=>({useSourceBack:()=>jest.fn()}));
jest.mock('../../storage/databaseClient',()=>({getDatabase:()=>({})}));
jest.mock('../threadStore',()=>({createLocalThreadStore:()=>({load:mockLoad})}));
jest.mock('react-native-safe-area-context',()=>require('react-native-safe-area-context/jest/mock').default);
import {SkillRunScreen} from './SkillRunScreen';

test('review probe: a valid reference attachment is omitted from both exact-run and all-message evidence',async()=>{
 const user={id:'user',role:'user',content:'请按参考图修改角色',attachments:[{id:'reference',type:'image',filename:'character-reference.png',metadata:{attachmentId:'reference',displayName:'图片1'},source:{type:'url',value:'file:///local/character-reference.png',mimeType:'image/png'}}]};
 const normal=normalizeMessages([user])[0];
 expect(normal.kind).toBe('user');
 expect((normal as any).attachments).toHaveLength(1);
 mockLoad.mockResolvedValue({threadId:'thread',messages:[user],state:{h3Runs:[{id:'run',status:'completed',userMessageId:'user',messageIds:[],tools:[],startedAt:1}]}});
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<SkillRunScreen/>);});
  expect(JSON.stringify(tree.toJSON())).toContain('请按参考图修改角色');
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain('character-reference.png');
  expect(JSON.stringify(tree.toJSON())).not.toContain('查看参考图片');
  act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='查看原会话全部消息')!.props.onPress());
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain('character-reference.png');
 }finally{act(()=>tree?.unmount());}
});
