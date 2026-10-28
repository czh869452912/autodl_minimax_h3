jest.mock('./ProjectShots', () => ({ ProjectShots: () => null }));
import { Alert } from 'react-native';
import { usePreventRemove } from 'expo-router/react-navigation';
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ dispatch: jest.fn() }), usePreventRemove: jest.fn() }));
jest.mock('./ProjectOverview', () => ({ ProjectOverview: () => null }));
jest.mock('./AudioVersionPreview',()=>({AudioVersionPreview:()=>null}));
import React from 'react';
import { act, create } from 'react-test-renderer';
import { CreativeWorkspace } from './CreativeWorkspace';
const mockExecute = jest.fn(async () => ({ status: 'completed', receiptId: 'r', value: {} }));
const mockService = { latestDeliveries: jest.fn(async () => []), saveProjectTab: jest.fn(async () => undefined), asset: jest.fn<Promise<any>, [string]>(async () => undefined), project: jest.fn(), description: jest.fn(async () => null), versions: jest.fn<Promise<any[]>, [string]>(async () => []), links: jest.fn(async () => []), isTrashed: jest.fn(async () => false), deliveries: jest.fn(async () => []), covers:jest.fn(async()=>[]),projects: jest.fn<Promise<any[]>, any[]>(async () => []), assets: jest.fn(async () => []), execute: mockExecute };
jest.mock('./runtime', () => ({ creativeService: () => mockService, importCreativeImage: jest.fn(), creativeFiles: () => ({ verify: jest.fn(async () => true) }) }));
jest.mock('../native/imagePicker', () => ({ pickImagesFromGallery: jest.fn(async () => []) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]) }));

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
const content = (tree: ReturnType<typeof create>) => JSON.stringify(tree.toJSON());

test('invalid asset route shows recovery instead of unrelated import controls', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeWorkspace mode="assets" assetId="missing" />); });
    expect(content(tree)).toContain('素材不存在');
    expect(content(tree)).not.toContain('导入图片');
  } finally { act(() => tree?.unmount()); }
});

test('ordinary asset preview keeps management details hidden and is not presented as trashed', async () => {
  mockService.asset.mockResolvedValueOnce({id:'a',kind:'image',title:'预览',revision:1});
  mockService.versions.mockResolvedValueOnce([]);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeWorkspace mode="assets" assetId="a" />); });
    expect(content(tree)).not.toContain('此素材位于回收站');
    expect(content(tree)).not.toContain('编辑名称与标签');
    act(() => press(tree,'更多'));
    expect(content(tree)).toContain('编辑名称与标签');
  } finally {act(()=>tree?.unmount());}
});

test('missing requested version falls back and trash status comes from storage', async () => {
  mockService.asset.mockResolvedValueOnce({ id: 'a', kind: 'image', title: 'A', revision: 1 });
  mockService.isTrashed.mockResolvedValueOnce(true);
  mockService.versions.mockResolvedValue([{ id: 'v', assetId: 'a', versionNo: 1, state: 'AVAILABLE', recipe: { input: {} }, mime: 'image/png', relativePath: 'a.png' }]);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeWorkspace mode="assets" assetId="a" initialVersionId="removed" />); });
    expect(content(tree)).toContain('版本 1 预览');
    expect(content(tree)).toContain('从回收站恢复');
    expect(content(tree)).not.toContain('从此版本创建视频草稿');
    expect(content(tree)).not.toContain('恢复参数并继续出图');
  } finally { act(() => tree?.unmount()); mockService.versions.mockResolvedValue([]); }
});

test('archive remains in project detail with a restore action', async () => {
  const project = { id: 'p', title: 'Test', brief: '', revision: 1 };
  mockService.projects.mockResolvedValue([project]);
  mockExecute.mockImplementationOnce(async () => { mockService.projects.mockResolvedValue([{ ...project, archivedAt: 42, revision: 2 }]); return { status: 'completed', receiptId: 'r', value: {} }; });
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeWorkspace mode="projects" projectId="p" initialTab="brief" />); });
    act(() => press(tree, '更多'));
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
    expect(content(tree)).toContain('✓ 镜头');
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
