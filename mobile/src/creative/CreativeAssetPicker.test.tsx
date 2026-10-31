jest.mock('expo-router/react-navigation',()=>({useIsFocused:()=>true}));
jest.mock('expo-router',()=>({useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
import React from 'react';
import { act, create } from 'react-test-renderer';
import { CreativeAssetPicker } from './CreativeAssetPicker';
const mockVerify = jest.fn(),mockPick=jest.fn(),mockImport=jest.fn();
let mockItems:any[]|undefined;
jest.mock('../native/imagePicker',()=>({pickImagesFromGallery:()=>mockPick()}));
const mockVersion = { id: 'version', assetId: 'asset', versionNo: 2, state: 'AVAILABLE', mime: 'image/png', relativePath: 'a.png', recipe: {} };
jest.mock('./runtime', () => ({ creativeService: () => ({ availableVersionPage: async () => ({items:mockItems??[{title:'Forest',version:mockVersion}],next:undefined}), versionsByIds:async()=>[mockVersion] }), importCreativeImage:(...args:unknown[])=>mockImport(...args), creativeFiles: () => ({ verify: (...args: unknown[]) => mockVerify(...args) }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
const button = (tree: ReturnType<typeof create>, label: string) => tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
beforeEach(() => {jest.clearAllMocks();mockItems=undefined;mockPick.mockResolvedValue([]);mockImport.mockResolvedValue({status:"completed",value:{versionId:"version"}});});

test('selecting a thumbnail does not attach it until confirmation and duplicate confirmations are locked', async () => {
  let release!: () => void;
  mockVerify.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  const choose = jest.fn(async () => undefined), close = jest.fn();
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeAssetPicker kind="image" onChoose={choose} onClose={close} />); });
    expect(button(tree, '使用所选图片').props.accessibilityState.disabled).toBe(true);
    act(() => button(tree, '选择 Forest · 版本 2').props.onPress());
    expect(choose).not.toHaveBeenCalled();
    const confirm = button(tree, '使用所选图片').props.onPress;
    act(() => { confirm(); confirm(); });
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    await act(async () => release());
    expect(choose).toHaveBeenCalledWith(mockVersion);
    expect(close).toHaveBeenCalledTimes(1);
  } finally { act(() => tree?.unmount()); }
});

test('failed attachment keeps the picker open and preserves the selection for recovery', async () => {
  mockVerify.mockRejectedValueOnce(new Error('原文件待恢复'));
  const choose = jest.fn(async () => undefined), close = jest.fn();
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeAssetPicker kind="image" onChoose={choose} onClose={close} />); });
    act(() => button(tree, '选择 Forest · 版本 2').props.onPress());
    await act(async () => button(tree, '使用所选图片').props.onPress());
    expect(close).not.toHaveBeenCalled();
    expect(choose).not.toHaveBeenCalled();
    expect(button(tree, '选择 Forest · 版本 2').props.accessibilityState.selected).toBe(true);
    expect(tree.root.findAll(n => n.props.accessibilityRole === 'alert' && n.props.children === '原文件待恢复').length).toBeGreaterThan(0);
  } finally { act(() => tree?.unmount()); }
});

test('empty project keeps target and offers all-library, import cancellation leaves adoption untouched',async()=>{
 mockItems=[];const choose=jest.fn(),close=jest.fn();let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<CreativeAssetPicker kind="image" projectId="p" purpose="adopt" target="Shot 1" onChoose={choose} onClose={close}/>);});
 expect(tree.root.findAll(n=>n.props.children==='本项目暂无可用版本').length).toBeGreaterThan(0);
 expect(tree.root.findAll(n=>Array.isArray(n.props.children)&&n.props.children.includes(' · Shot 1')).length).toBeGreaterThan(0);
 await act(async()=>button(tree,'从设备导入图片').props.onPress());
 expect(mockImport).not.toHaveBeenCalled();expect(choose).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
 await act(async()=>button(tree,'从全部素材选择').props.onPress());
 expect(tree.root.findAll(n=>n.props.children==='素材库暂无可用版本').length).toBeGreaterThan(0);
 }finally{act(()=>tree?.unmount());}
});
test('import locates exact deduplicated version but still waits for explicit adoption',async()=>{
 mockItems=[];mockPick.mockResolvedValue([{uri:'file://image',name:'Imported'}]);mockVerify.mockResolvedValue(undefined);
 const choose=jest.fn(async()=>undefined),close=jest.fn();let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<CreativeAssetPicker kind="image" projectId="p" onChoose={choose} onClose={close}/>);});
 await act(async()=>button(tree,'从设备导入图片').props.onPress());
 expect(mockImport).toHaveBeenCalledWith(expect.objectContaining({name:'Imported'}),'p');
 expect(choose).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
 expect(button(tree,'选择 Imported · 版本 2').props.accessibilityState.selected).toBe(true);
 await act(async()=>button(tree,'使用所选图片').props.onPress());expect(choose).toHaveBeenCalledWith(mockVersion);
 }finally{act(()=>tree?.unmount());}
});

test('cover selection names its target and does not write on cancellation',async()=>{
 const choose=jest.fn(),close=jest.fn();let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<CreativeAssetPicker kind="image" purpose="cover" target="My project" projectId="p" onChoose={choose} onClose={close}/>);});
 expect(tree.root.findAll(n=>n.props.children==='选择项目封面').length).toBeGreaterThan(0);expect(tree.root.findAll(n=>Array.isArray(n.props.children)&&n.props.children.includes(' · My project')).length).toBeGreaterThan(0);
 expect(button(tree,'设为项目封面').props.accessibilityState.disabled).toBe(true);
 act(()=>button(tree,'取消').props.onPress());expect(close).toHaveBeenCalled();expect(choose).not.toHaveBeenCalled();
 }finally{act(()=>tree?.unmount());}
});
