jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
import React from 'react';
import { act, create } from 'react-test-renderer';
import { ProjectShots } from './ProjectShots';
const mockPush = jest.fn(), mockExecute = jest.fn();
let mockShot: any, mockDrafts: any[];
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('./runtime', () => ({ creativeService: () => ({ shots: async () => [mockShot], drafts: async () => mockDrafts, execute: mockExecute, versionAsset: async () => ({ asset_id: 'asset' }) }) }));
jest.mock('./VersionThumbnail', () => ({ VersionThumbnail: () => null }));
jest.mock('./CreativeAssetPicker', () => ({ CreativeAssetPicker: () => null }));
beforeEach(() => { jest.clearAllMocks(); mockShot = { id: 's', title: 'Shot', description: '', revision: 1, editorial_status: 'planned', selected_image: 'image',image_state:'AVAILABLE' }; mockDrafts = [{ id: 'existing', shot_id: 's', provider_id: 'autodl', state: 'EDITING' }]; });
const press = (tree: ReturnType<typeof create>, label: string) => tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress();
test('continues an existing shot draft instead of creating another', async () => {
 let tree!: ReturnType<typeof create>;
 try { await act(async () => { tree = create(<ProjectShots projectId="p" />); }); act(() => press(tree,'继续制作视频')); expect(mockPush).toHaveBeenCalledWith({ pathname: '/creative-draft/[id]', params: { id: 'existing' } }); expect(mockExecute).not.toHaveBeenCalled(); }
 finally { act(() => tree.unmount()); }
});
test('reports unsaved shot fields to the parent navigation guard', async () => {
 const state = jest.fn(); let tree!: ReturnType<typeof create>;
 try { await act(async () => { tree = create(<ProjectShots projectId="p" onEditorState={state} />); }); act(() => press(tree,'更多镜头操作')); act(() => press(tree,'编辑镜头')); act(() => tree.root.findByProps({accessibilityLabel:'镜头名称'}).props.onChangeText('Changed')); expect(state).toHaveBeenLastCalledWith({dirty:true,busy:false}); }
 finally { act(() => tree.unmount()); }
});
test('archived project still allows reviewing adopted video', async () => {
 mockShot.selected_video='video'; let tree!: ReturnType<typeof create>;
 try { await act(async () => { tree = create(<ProjectShots projectId="p" archived />); }); await act(async () => press(tree,'审阅视频成果')); expect(mockPush).toHaveBeenCalledWith({pathname:'/creative-shot/[id]',params:{id:'s',projectId:'p'}}); }
 finally { act(() => tree.unmount()); }
});


test('adopted video keeps generation candidates reachable without creating another draft',async()=>{
  mockShot.selected_video='video';mockDrafts[0].state='SUBMITTED';let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ProjectShots projectId="p" initialShotId="s"/>);});
    act(()=>press(tree,'查看视频草稿 · existing'));
    expect(mockPush).toHaveBeenCalledWith({pathname:'/creative-draft/[id]',params:{id:'existing'}});
    expect(mockExecute).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('当前创作镜头');
    act(()=>press(tree,'全部镜头'));
    expect(JSON.stringify(tree.toJSON())).not.toContain('当前创作镜头');
  }finally{act(()=>tree?.unmount());}
});
