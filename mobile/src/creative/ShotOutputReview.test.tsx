import React from 'react';
import {act,create} from 'react-test-renderer';
import {ShotOutputReview} from './ShotOutputReview';
const mockExecute=jest.fn(),mockPush=jest.fn();let mockShot:any,mockVersions:any[];
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,canGoBack:()=>true,back:jest.fn()}),useFocusEffect:(fn:any)=>require('react').useEffect(fn,[fn])}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View}));
jest.mock('../media/VideoPlayer',()=>({VideoPlayer:()=>null}));
jest.mock('./MediaPreview',()=>({MediaPreview:()=>null}));
jest.mock('./runtime',()=>({creativeService:()=>({project:async()=>({id:'p'}),shots:async()=>[mockShot],drafts:async()=>[{id:'d',job_id:'job',provider_id:'autodl',shot_id:'s',target_asset_id:'a'}],versions:async()=>mockVersions,versionsByIds:async()=>[],execute:mockExecute}),creativeFiles:()=>({verify:async()=>{}})}));
const press=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0].props.onPress();
beforeEach(()=>{jest.clearAllMocks();mockShot={id:'s',title:'Shot',revision:4,selected_video:'gone'};mockVersions=[{id:'b',assetId:'a',versionNo:2,mime:'video/mp4',state:'AVAILABLE',recipe:{jobId:'job'}}];mockExecute.mockResolvedValue({status:'completed'});});
test('missing adopted output stays unavailable until a user explicitly selects and adopts a candidate',async()=>{
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<ShotOutputReview projectId="p" shotId="s"/>);});
  expect(JSON.stringify(tree.toJSON())).toContain('指定版本已不可用');expect(mockExecute).not.toHaveBeenCalled();
  act(()=>press(tree,'候选 · 1 · v2'));
  await act(async()=>press(tree,'采用此版本'));
  expect(mockExecute).toHaveBeenCalledWith({name:'shot.selectOutput',payload:{id:'s',expectedRevision:4,slot:'selected_video',versionId:'b'}},expect.any(String));
 }finally{act(()=>tree?.unmount());}
});
