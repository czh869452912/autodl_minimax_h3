import React from 'react';
import {act,create} from 'react-test-renderer';
import {ListAction} from '../../ui/ListPageUI';
const mockLoad=jest.fn();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({threadId:'t',runId:'r'})}));
jest.mock('../../navigation/useSourceBack',()=>({useSourceBack:()=>jest.fn()}));
jest.mock('../../storage/databaseClient',()=>({getDatabase:()=>({})}));
jest.mock('../threadStore',()=>({createLocalThreadStore:()=>({load:mockLoad})}));
jest.mock('react-native-safe-area-context',()=>require('react-native-safe-area-context/jest/mock').default);
import {SkillRunScreen} from './SkillRunScreen';
test('locates the original run and offers the original conversation without creating a runtime',async()=>{
 mockLoad.mockResolvedValue({threadId:'t',messages:[{id:'u',role:'user',content:'target request'},{id:'other',role:'user',content:'other request'}],state:{h3Runs:[{id:'r',status:'completed',userMessageId:'u',messageIds:[],tools:[],startedAt:1}]}});
 let tree!:ReturnType<typeof create>;try{await act(async()=>{tree=create(<SkillRunScreen/>);});
 expect(mockLoad).toHaveBeenCalledWith('t');expect(JSON.stringify(tree.toJSON())).toContain('target request');expect(JSON.stringify(tree.toJSON())).not.toContain('other request');
 act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='查看原会话全部消息')!.props.onPress());expect(JSON.stringify(tree.toJSON())).toContain('other request');
 }finally{act(()=>tree.unmount());}
});
