import React from 'react';
import {act,create} from 'react-test-renderer';
import {Text} from 'react-native';
import {ListAction} from '../ui/ListPageUI';
const mockPush=jest.fn(),mockFirst=jest.fn(),mockPage=jest.fn();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({projectId:'p',timelineId:'old-timeline'}),useRouter:()=>({push:mockPush,back:jest.fn()})}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:mockFirst})}));
jest.mock('./useLiveRefresh',()=>({useLiveRefresh:jest.fn()}));
jest.mock('./useUnsavedChanges',()=>({useUnsavedChanges:()=>((fn:()=>void)=>fn())}));
jest.mock('../tasks/executorEvents',()=>({executorWakePort:{signal:jest.fn()}}));
jest.mock('./CreativeAssetPicker',()=>({CreativeAssetPicker:()=>null}));
jest.mock('./runtime',()=>({creativeService:()=>({versionsByIds:async()=>[{id:'package-version',assetId:'package-asset'}]})}));
jest.mock('./timelines',()=>({readTimelinePage:mockPage,timelineSpec:{parse:JSON.parse}}));
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
