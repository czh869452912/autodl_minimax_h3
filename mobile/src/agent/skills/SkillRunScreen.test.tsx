import {runEvents} from '../runEvents';
jest.mock('../../ui/ImagePreview',()=>({ImagePreview:()=>null}));
import {Image} from 'react-native';
import {ImagePreview} from '../../ui/ImagePreview';
import React from 'react';
import {act,create} from 'react-test-renderer';
import {ListAction} from '../../ui/ListPageUI';
const mockLoad=jest.fn();
let mockParams={threadId:'t',runId:'r'};
const mockFocus=new Set<()=>void>();
beforeEach(()=>{mockParams={threadId:'t',runId:'r'};mockLoad.mockReset();});
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockParams,useFocusEffect:(effect:()=>void)=>require('react').useEffect(()=>{mockFocus.add(effect);const cleanup=effect();return()=>{mockFocus.delete(effect);if(typeof cleanup==='function')(cleanup as ()=>void)();};},[effect])}));
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

const record=(content:string,status='completed')=>({threadId:'t',messages:[{id:'u',role:'user',content}],state:{h3Runs:[{id:'r',status,userMessageId:'u',messageIds:[],tools:[],startedAt:1}]}});
test('failed refresh retains evidence and scope; manual retry and refocus recover',async()=>{
 mockLoad.mockResolvedValue(record('original'));let tree!:ReturnType<typeof create>;
 try{
 await act(async()=>{tree=create(<SkillRunScreen/>);});
 act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='查看原会话全部消息')!.props.onPress());
 mockLoad.mockRejectedValueOnce(Error('database busy'));await act(async()=>runEvents.publish({threadId:'t',kind:'status-changed'}));
 expect(JSON.stringify(tree.toJSON())).toContain('original');expect(JSON.stringify(tree.toJSON())).toContain('database busy');expect(tree.root.findAllByType(ListAction).some(n=>n.props.label==='仅看此运行消息')).toBe(true);
 mockLoad.mockResolvedValue(record('recovered'));await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='获取最新记录')!.props.onPress());
 expect(JSON.stringify(tree.toJSON())).toContain('recovered');expect(JSON.stringify(tree.toJSON())).not.toContain('database busy');
 mockLoad.mockResolvedValue(record('refocused'));await act(async()=>{for(const effect of mockFocus)effect();});expect(JSON.stringify(tree.toJSON())).toContain('refocused');
 }finally{act(()=>tree.unmount());}
});
test('late reads cannot overwrite newer evidence; unrelated and unmounted listeners do not read',async()=>{
 mockLoad.mockResolvedValue(record('initial','running'));let tree!:ReturnType<typeof create>,release!:(value:unknown)=>void;
 await act(async()=>{tree=create(<SkillRunScreen/>);});mockLoad.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));await act(async()=>runEvents.publish({threadId:'t',kind:'status-changed'}));
 mockLoad.mockResolvedValue(record('final'));await act(async()=>runEvents.publish({threadId:'t',kind:'status-changed'}));await act(async()=>release(record('obsolete','running')));
 expect(JSON.stringify(tree.toJSON())).toContain('final');expect(JSON.stringify(tree.toJSON())).not.toContain('obsolete');
 mockLoad.mockClear();await act(async()=>runEvents.publish({threadId:'other',kind:'status-changed'}));expect(mockLoad).not.toHaveBeenCalled();act(()=>tree.unmount());runEvents.publish({threadId:'t',kind:'status-changed'});expect(mockLoad).not.toHaveBeenCalled();
});
test('route change invalidates old reads and resets message scope',async()=>{
 mockLoad.mockResolvedValue(record('initial'));let tree!:ReturnType<typeof create>,release!:(value:unknown)=>void;
 try{
 await act(async()=>{tree=create(<SkillRunScreen/>);});act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='查看原会话全部消息')!.props.onPress());
 mockLoad.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));await act(async()=>runEvents.publish({threadId:'t',kind:'status-changed'}));
 mockParams={threadId:'new',runId:'r'};mockLoad.mockResolvedValue({...record('new thread'),threadId:'new'});await act(async()=>tree.update(<SkillRunScreen/>));await act(async()=>release(record('old thread')));
 expect(JSON.stringify(tree.toJSON())).toContain('new thread');expect(JSON.stringify(tree.toJSON())).not.toContain('old thread');expect(tree.root.findAllByType(ListAction).some(n=>n.props.label==='查看原会话全部消息')).toBe(true);
 }finally{act(()=>tree.unmount());}
});
