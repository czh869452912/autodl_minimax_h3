import React from 'react';
import {act,create} from 'react-test-renderer';
import {Text,TextInput} from 'react-native';
import {ListAction} from '../ui/ListPageUI';
const mockPush=jest.fn(),mockFirst=jest.fn(),mockPage=jest.fn(),mockExecute=jest.fn(),mockSetParams=jest.fn();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({projectId:'p',timelineId:'old-timeline'}),useRouter:()=>({push:mockPush,setParams:mockSetParams,back:jest.fn()})}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:mockFirst})}));
jest.mock('./useLiveRefresh',()=>({useLiveRefresh:jest.fn()}));
jest.mock('./useUnsavedChanges',()=>({useUnsavedChanges:()=>((fn:()=>void)=>fn())}));
jest.mock('../tasks/executorEvents',()=>({executorWakePort:{signal:jest.fn()}}));
jest.mock('./CreativeAssetPicker',()=>({CreativeAssetPicker:()=>null}));
jest.mock('./runtime',()=>({creativeService:()=>({execute:mockExecute,versionsByIds:async()=>[{id:'package-version',assetId:'package-asset'}]})}));
jest.mock('./timelines',()=>({readTimelinePage:mockPage,timelineSpec:{parse:(value:unknown)=>value}}));
jest.mock('./fileImport',()=>({saveCreativeText:jest.fn()}));
jest.mock('./timelinePackage',()=>({createTimelinePackage:async()=>({status:'completed',value:{assetId:'package-asset',versionId:'package-version'}})}));
import {TimelineScreen} from './TimelineScreen';
test('opens exact old timeline independently of paging and routes its new package to the exact version',async()=>{
 mockFirst.mockResolvedValue({id:'old-timeline',project_id:'p',title:'Older than page 1',created_at:1});let tree!:ReturnType<typeof create>;
 await act(async()=>{tree=create(<TimelineScreen/>);});expect(mockFirst).toHaveBeenCalledWith(expect.stringContaining('project_id=?'),'old-timeline','p');expect(mockPage).not.toHaveBeenCalled();
 const click=async(label:string)=>act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label===label)!.props.onPress());
 await click('打包工程与原件（最多 90MB）');await click('打开刚保存的工程文件');expect(mockPush).toHaveBeenLastCalledWith({pathname:'/creative-asset/[id]',params:{id:'package-asset',versionId:'package-version',projectId:'p'}});act(()=>tree.unmount());
});
test('missing or out-of-scope timeline is explained instead of falling back to recent results',async()=>{
 mockFirst.mockResolvedValue(null);let tree!:ReturnType<typeof create>;await act(async()=>{tree=create(<TimelineScreen/>);});
 expect(tree.root.findAllByType(Text).some(n=>String(n.props.children).includes('不属于此项目'))).toBe(true);expect(mockPage).not.toHaveBeenCalled();act(()=>tree.unmount());
});

test('saving a copy of A focuses B and the next render submits B; failures retain editing',async()=>{
 const spec={schemaVersion:1,orientation:'portrait',clips:[{versionId:'video',startMs:0,durationMs:1000,caption:'A'}],audio:null};
 mockFirst.mockImplementation(async(_sql:string,id:string)=>({id,project_id:'p',title:id==='old-timeline'?'A':'B',spec_json:JSON.stringify(spec),created_at:1}));
 mockExecute.mockClear();mockSetParams.mockClear();let tree!:ReturnType<typeof create>;await act(async()=>{tree=create(<TimelineScreen/>);});
 const click=async(label:string)=>act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label===label)!.props.onPress());
 await click('载入副本继续编辑');act(()=>tree.root.findByProps({accessibilityLabel:'工程名称'}).props.onChangeText('B'));
 mockExecute.mockRejectedValueOnce(new Error('disk full'));await click('保存新工程快照');expect(mockSetParams).not.toHaveBeenCalled();expect(tree.root.findByProps({accessibilityLabel:'工程名称'}).props.value).toBe('B');
 mockExecute.mockResolvedValueOnce({status:'completed',value:{timelineId:'new-B'}});await click('保存新工程快照');expect(mockSetParams).toHaveBeenLastCalledWith({timelineId:'new-B'});
 mockExecute.mockResolvedValueOnce({status:'completed',value:{}});await click('在本机合成');expect(mockExecute).toHaveBeenLastCalledWith({name:'timeline.render',payload:{id:'new-B'}},expect.any(String));act(()=>tree.unmount());
});
