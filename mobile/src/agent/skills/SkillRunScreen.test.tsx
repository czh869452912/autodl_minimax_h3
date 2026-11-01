jest.mock('../../ui/ImagePreview',()=>({ImagePreview:()=>null}));
import {Image} from 'react-native';
import {ImagePreview} from '../../ui/ImagePreview';
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


test.each(['attachment','content'])('retains %s images across run/all views and explains unavailable files',async(kind)=>{
 const picture=kind==='attachment'?{type:'image',source:{type:'url',url:'file:///reference.png'},metadata:{filename:'reference.png',attachmentId:'stable-image',displayName:'图1'}}:{type:'image_url',image_url:{url:'file:///reference.png'},metadata:{filename:'reference.png',attachmentId:'stable-image',displayName:'图1'}};
 mockLoad.mockResolvedValue({threadId:'t',messages:[{id:'u',role:'user',content:kind==='content'?[{type:'text',text:'按图1修改'},picture]:'按图1修改',attachments:kind==='attachment'?[picture]:[]}],state:{h3Runs:[{id:'r',status:'completed',retryOf:'original',userMessageId:'u',messageIds:[],tools:[],startedAt:1}]}});
 let tree!:ReturnType<typeof create>;try{await act(async()=>{tree=create(<SkillRunScreen/>);});
 expect(tree.root.findByType(Image).props.source.uri).toBe('file:///reference.png');expect(JSON.stringify(tree.toJSON())).toContain('stable-image');expect(JSON.stringify(tree.toJSON())).toContain('reference.png');
 act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='查看参考图片 图1'&&n.props.onPress)[0].props.onPress());expect(tree.root.findByType(ImagePreview).props.uri).toBe('file:///reference.png');
 act(()=>tree.root.findByType(ImagePreview).props.onClose());
 act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='查看原会话全部消息')!.props.onPress());expect(tree.root.findByType(Image).props.source.uri).toBe('file:///reference.png');
 act(()=>tree.root.findByType(Image).props.onError());expect(JSON.stringify(tree.toJSON())).toContain('图片不可用');expect(JSON.stringify(tree.toJSON())).toContain('stable-image');expect(tree.root.findAllByType(Image)).toHaveLength(0);
 }finally{act(()=>tree.unmount());}
});
