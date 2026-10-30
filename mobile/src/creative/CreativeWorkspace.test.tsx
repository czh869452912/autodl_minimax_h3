jest.mock('./ProjectShots', () => ({ ProjectShots: () => null }));
import { Alert, Image } from 'react-native';
jest.spyOn(Image,'getSize').mockImplementation((_uri,success)=>{success?.(600,480);return Promise.resolve({width:600,height:480});});
import { usePreventRemove } from 'expo-router/react-navigation';
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ dispatch: jest.fn() }), usePreventRemove: jest.fn() }));
jest.mock('./ProjectOverview', () => ({ ProjectOverview: () => null }));
jest.mock('./AudioVersionPreview',()=>({AudioVersionPreview:()=>null}));
import React from 'react';
import { act, create } from 'react-test-renderer';
import { CreativeWorkspace } from './CreativeWorkspace';
const mockPush=jest.fn();
const mockExecute = jest.fn<Promise<any>,any[]>(async () => ({ status: 'completed', receiptId: 'r', value: {projectId:'created'} }));
let mockVersionRows: any[]=[];
const mockService = { resultHistoryPage:jest.fn(async()=>{mockVersionRows=await mockService.versions('test');return {ids:mockVersionRows.map(v=>v.id),stamp:'test',next:undefined};}), versionsByIds:jest.fn(async(ids:string[])=>mockVersionRows.filter(v=>ids.includes(v.id))), projectTab:jest.fn<Promise<any>,[string]>(async()=> 'shots'), latestDeliveries: jest.fn(async () => []), saveProjectTab: jest.fn(async () => undefined), asset: jest.fn<Promise<any>, [string]>(async () => undefined), project: jest.fn(), description: jest.fn(async () => null), versions: jest.fn<Promise<any[]>, [string]>(async () => []), links: jest.fn(async () => []), isTrashed: jest.fn(async () => false), deliveries: jest.fn(async () => []), covers:jest.fn(async()=>[]),projects: jest.fn<Promise<any[]>, any[]>(async () => []), assets: jest.fn(async () => []), execute: mockExecute };
jest.mock('./runtime', () => ({ creativeService: () => mockService, importCreativeImage: jest.fn(), creativeFiles: () => ({ verify: jest.fn(async () => true) }) }));
jest.mock('../native/imagePicker', () => ({ pickImagesFromGallery: jest.fn(async () => []) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]) }));

test('project creation uses the shared command and prevents simultaneous duplicate taps', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeWorkspace mode="projects" />); });
    act(() => { tree.root.findAll(n => n.props.accessibilityLabel === '新建项目' && typeof n.props.onPress === 'function')[0].props.onPress(); });
    act(() => { tree.root.findByProps({ accessibilityLabel: '项目名称' }).props.onChangeText('Observatory'); tree.root.findByProps({ accessibilityLabel: '创作简报' }).props.onChangeText('A short film'); });
    const button = tree.root.findAll(n => n.props.accessibilityLabel === '创建项目' && typeof n.props.onPress === 'function')[0];
    await act(async () => { button.props.onPress(); button.props.onPress(); });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith({ name: 'project.create', payload: { title: 'Observatory', brief: 'A short film' } }, expect.any(String));
    expect(tree.root.findAllByProps({ accessibilityLabel: '项目名称' })).toHaveLength(0);
  } finally { act(() => tree?.unmount()); }
});

const press = (tree: ReturnType<typeof create>, label: string) => tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress();
const content = (tree: ReturnType<typeof create>) => JSON.stringify(tree.toJSON(),(key,value)=>key==='ListHeaderComponent'||key==='ListFooterComponent'?undefined:value);

test('invalid asset route shows recovery instead of unrelated import controls', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeWorkspace mode="assets" assetId="missing" />); });
    expect(content(tree)).toContain('素材不存在');
    expect(content(tree)).not.toContain('导入图片');
  } finally { act(() => tree?.unmount()); }
});

test('ordinary asset preview exposes metadata editing without opening more actions', async () => {
  mockService.asset.mockResolvedValueOnce({id:'a',kind:'image',title:'预览',revision:1});
  mockService.versions.mockResolvedValueOnce([]);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeWorkspace mode="assets" assetId="a" />); });
    expect(content(tree)).not.toContain('此素材位于回收站');
    expect(content(tree)).toContain('编辑名称与标签');
    act(() => press(tree,'编辑名称与标签'));
    expect(content(tree)).toContain('资产名称');
  } finally {act(()=>tree?.unmount());}
});

test('missing requested version requires an explicit switch and trash status comes from storage', async () => {
  mockService.asset.mockResolvedValueOnce({ id: 'a', kind: 'image', title: 'A', revision: 1 });
  mockService.isTrashed.mockResolvedValueOnce(true);
  mockService.versions.mockResolvedValue([{ id: 'v', assetId: 'a', versionNo: 1, state: 'AVAILABLE', recipe: { input: {} }, mime: 'image/png', relativePath: 'a.png' }]);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeWorkspace mode="assets" assetId="a" initialVersionId="removed" />); });
    expect(content(tree)).toContain('该版本不可用');
    expect(content(tree)).not.toContain('版本 1 预览');
    expect(content(tree)).not.toContain('保存到系统相册');
    act(() => press(tree, '查看其他版本'));
    expect(content(tree)).toContain('版本 1 预览');
    expect(content(tree)).toContain('从回收站恢复');
    expect(content(tree)).not.toContain('从此版本创建视频草稿');
    expect(content(tree)).not.toContain('恢复参数并继续出图');
  } finally { act(() => tree?.unmount()); mockService.versions.mockResolvedValue([]); }
});

test('ordinary browsing uses the default version while a missing original keeps its exact identity', async () => {
  mockService.asset.mockResolvedValue({ id:'a', kind:'image', title:'A', revision:1, currentVersionId:'v1' });
  mockService.versions.mockResolvedValue([1,2].map(n=>({ id:`v${n}`, assetId:'a', versionNo:n, state:n===1?'MISSING':'AVAILABLE', recipe:{}, mime:'image/png', relativePath:n===2?'2.png':undefined })));
  let tree!:ReturnType<typeof create>;
  try {
    await act(async()=>{tree=create(<CreativeWorkspace mode="assets" assetId="a"/>);});
    expect(content(tree)).toContain('版本 1 预览');
    expect(content(tree)).toContain('文件待恢复');
    expect(content(tree)).not.toContain('该版本不可用');
    await act(async()=>tree.update(<CreativeWorkspace mode="assets" assetId="a" initialVersionId="v2"/>));
    expect(content(tree)).toContain('版本 2 预览');
    await act(async()=>tree.update(<CreativeWorkspace mode="assets" assetId="a" initialVersionId="removed"/>));
    expect(content(tree)).not.toContain('版本 2 预览');
    expect(content(tree)).toContain('该版本不可用');
  } finally { act(()=>tree?.unmount()); mockService.asset.mockResolvedValue(undefined); mockService.versions.mockResolvedValue([]); }
});

test('archive remains in project detail with a restore action', async () => {
  const project = { id: 'p', title: 'Test', brief: '', revision: 1 };
  mockService.projects.mockResolvedValue([project]);
  mockExecute.mockImplementationOnce(async () => { mockService.projects.mockResolvedValue([{ ...project, archivedAt: 42, revision: 2 }]); return { status: 'completed', receiptId: 'r', value: {} }; });
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeWorkspace mode="projects" projectId="p" initialTab="brief" />); });
    act(() => press(tree, '项目设置'));
    await act(async () => press(tree, '归档项目'));
    expect(content(tree)).toContain('恢复项目');
    expect(content(tree)).not.toContain('新建项目');
  } finally { act(() => tree?.unmount()); mockService.projects.mockResolvedValue([]); }
});


test('unsaved project brief blocks route removal and tab changes until explicitly discarded', async () => {
  mockService.projects.mockResolvedValue([{ id: 'p', title: 'Test', brief: '', revision: 1 }]);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeWorkspace mode="projects" projectId="p" initialTab="brief" />); });
    act(() => tree.root.findByType(require('./ProjectOverview').ProjectOverview).props.onEdit());
    act(() => tree.root.findByProps({ accessibilityLabel: '创作简报' }).props.onChangeText('Unsaved brief'));
    expect(usePreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
    act(() => press(tree, '镜头'));
    expect(alert).toHaveBeenCalledWith('尚有未保存的修改', expect.any(String), expect.any(Array));
    expect(tree.root.findByProps({ accessibilityLabel: '创作简报' }).props.value).toBe('Unsaved brief');
    act(() => alert.mock.calls[0][2]![1].onPress!());
    expect(tree.root.findAll(n=>n.props.accessibilityLabel==='镜头'&&n.props.accessibilityState?.checked).length).toBeGreaterThan(0);
    expect(usePreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
  } finally { act(() => tree?.unmount()); alert.mockRestore(); mockService.projects.mockResolvedValue([]); }
});

test('import is an action separate from asset filters and does not change the selected category',async()=>{
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<CreativeWorkspace mode="assets"/>);});
    await act(async()=>press(tree,'视频'));
    const before=mockService.assets.mock.calls.length;
    act(()=>press(tree,'导入素材'));
    expect(content(tree)).toContain('从相册导入图片');
    expect(content(tree)).toContain('从文件导入');
    const selected=tree.root.findAll(n=>n.props.accessibilityRole==='radio' && n.props.accessibilityLabel==='视频')[0];
    expect(selected.props.accessibilityState.checked).toBe(true);
    expect(mockService.assets).toHaveBeenCalledTimes(before);
    await act(async()=>press(tree,'从相册导入图片'));
    expect(selected.props.accessibilityState.checked).toBe(true);
  }finally{act(()=>tree?.unmount());}
});


test('saved project tab restores but cannot override a newer user selection or explicit target',async()=>{
 mockService.projects.mockResolvedValue([{id:'p',title:'Project',brief:'',revision:1}]);
 let resolve!:(tab:any)=>void;mockService.projectTab.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<CreativeWorkspace mode="projects" projectId="p"/>);});
  act(()=>press(tree,'概览'));
  await act(async()=>resolve('assets'));
  expect(tree.root.findAll(n=>n.props.accessibilityLabel==='概览'&&n.props.accessibilityState?.checked).length).toBeGreaterThan(0);
  await act(async()=>tree.update(<CreativeWorkspace mode="projects" projectId="p" initialTab="assets" requestId="new"/>));
  expect(tree.root.findAll(n=>n.props.accessibilityLabel==='素材'&&n.props.accessibilityState?.checked).length).toBeGreaterThan(0);
 }finally{act(()=>tree?.unmount());mockService.projects.mockResolvedValue([]);}
});


test('library separates storage management from content and has recycle bin and audio filters', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async()=>{tree=create(<CreativeWorkspace mode="assets"/>);});
    act(()=>press(tree,'素材管理'));
    act(()=>press(tree,'存储与清理，查看占用，清理缓存与孤儿文件'));
    expect(mockPush).toHaveBeenCalledWith({pathname:'/settings-panel',params:{section:'storage'}});
    await act(async()=>press(tree,'回收站'));
    expect(mockService.assets).toHaveBeenLastCalledWith(expect.objectContaining({trash:true}));
    const audio=tree.root.findAll(n=>n.props.accessibilityLabel==='音频'&&typeof n.props.onPress==='function')[0];
    await act(async()=>audio.props.onPress());
    expect(mockService.assets).toHaveBeenLastCalledWith(expect.objectContaining({kind:'audio'}));
  } finally {act(()=>tree?.unmount());}
});


test('project list does not fetch unrelated library assets', async () => {
  mockService.assets.mockClear();
  let tree!: ReturnType<typeof create>;
  try {
    await act(async()=>{tree=create(<CreativeWorkspace mode="projects"/>);});
    expect(mockService.assets).not.toHaveBeenCalled();
  } finally {act(()=>tree?.unmount());}
});

test('details expose facts and keep maintenance in panels',async()=>{
 mockService.asset.mockResolvedValue({id:'a',kind:'image',title:'A',revision:1,currentVersionId:'v',createdAt:1});
 mockService.versions.mockResolvedValue([{id:'v',assetId:'a',versionNo:1,source:'import',mime:'image/png',state:'MISSING',recipe:{}}]);
 let tree!:ReturnType<typeof create>;try{
 await act(async()=>{tree=create(<CreativeWorkspace mode="assets" assetId="a"/>);});
 expect(content(tree)).toContain('外部导入');expect(content(tree)).not.toContain('重新定位原图');
 act(()=>press(tree,'素材操作'));expect(content(tree)).toContain('重新定位原图');
 }finally{act(()=>tree?.unmount());mockService.asset.mockResolvedValue(undefined);mockService.versions.mockResolvedValue([]);}
});
