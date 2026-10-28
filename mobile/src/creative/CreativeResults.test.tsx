import React from 'react';
import { act, create } from 'react-test-renderer';
import { CreativeResults } from './CreativeResults';
import type { AssetVersion } from './types';
import type { CreativeDraft } from './drafts';
import {defaultNovelAiDraft} from './novelAiProtocol';
import {NativeModules,StyleSheet} from 'react-native';
import {ImagePreview} from '../ui/ImagePreview';
import { createEnhanceInput } from './novelAiEnhancement';
const mockDeliveries=jest.fn(async()=>[] as Array<{status:string;generation:number}>);
const mockPush = jest.fn(), mockReplace = jest.fn(), mockExecute = jest.fn();
const mockReadStatus=jest.fn(async()=>({status:mockStatus}));
const mockReadVersions=jest.fn(async(id:string)=>mockVersions.filter(v=>v.assetId===id));
let mockStatus = 'SUCCEEDED', mockVersions: AssetVersion[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('./runtime', () => ({ creativeService: () => ({ deliveries:mockDeliveries, versionStamp:async()=>JSON.stringify(mockVersions), versions:mockReadVersions, execute: mockExecute }), creativeFiles:()=>({verify:async()=>({state:'AVAILABLE'})}), exportCreativeVersion: jest.fn() }));
jest.mock('../storage/databaseClient', () => ({ getDatabase: () => ({ getFirstAsync: ()=>mockReadStatus() }) }));
jest.mock('./MediaPreview', () => ({ MediaPreview: () => null }));
jest.mock('../media/VideoPlayer', () => ({ VideoPlayer: () => null }));
const draft: CreativeDraft = { id: 'draft', project_id: 'project', shot_id: 'shot', target_asset_id: 'asset', provider_id: 'novelai', workflow_id: 'image', input_json: '{}', revision: 1, state: 'SUBMITTED', job_id: 'job' };
const findButton = (tree: ReturnType<typeof create>, label: string) => tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
beforeEach(() => {
  jest.clearAllMocks();mockDeliveries.mockReset().mockResolvedValue([]); mockReadStatus.mockReset().mockImplementation(async()=>({status:mockStatus}));mockStatus = 'SUCCEEDED';
  mockVersions = [2, 1].map(n => ({ id: `version-${n}`, assetId: 'asset', versionNo: n, source: 'generated', state: 'AVAILABLE', relativePath: `${n}.png`, mime: 'image/png', recipe: { jobId: 'job',input:defaultNovelAiDraft } }));
  mockExecute.mockResolvedValue({ status: 'completed', value: { draftId: 'next' } });
});

test('holding the floating compare control reveals the original without opening fullscreen or moving the stage',async()=>{
  mockVersions[0].recipe.input={...defaultNovelAiDraft,sourceVersionId:'version-1'};
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<CreativeResults draft={draft} canvas/>);});
    const control=()=>tree.root.findAll(n=>n.props.accessibilityLabel==='按住查看原图'&&n.props.onPressIn)[0];
    const overlay=()=>tree.root.findByProps({testID:'result-original-overlay'});
    const stage=tree.root.findByProps({testID:'result-image-stage'}).props.style;
    expect(StyleSheet.flatten(tree.root.findByProps({testID:'result-compare-overlay'}).props.style).position).toBe('absolute');
    expect(overlay().props.style.opacity).toBe(0);
    act(()=>control().props.onPressIn());
    expect(overlay().props.style.opacity).toBe(1);
    expect(overlay().props.source.uri).toContain('1.png');
    expect(tree.root.findAllByType(ImagePreview)).toHaveLength(0);
    expect(tree.root.findByProps({testID:'result-image-stage'}).props.style).toEqual(stage);
    act(()=>control().props.onPressOut());
    expect(overlay().props.style.opacity).toBe(0);
    act(()=>control().props.onPressIn());
    act(()=>findButton(tree,'上一张结果').props.onPress());
    expect(tree.root.findAllByProps({testID:'result-original-overlay'})).toHaveLength(0);
    act(()=>findButton(tree,'下一张结果').props.onPress());
    expect(overlay().props.style.opacity).toBe(0);
  }finally{act(()=>tree?.unmount());}
});

test('slow result reads do not overlap or let a delayed old status overwrite completion',async()=>{
  jest.useFakeTimers();
  let release!:(status:{status:string})=>void,tree!:ReturnType<typeof create>;
  const observed=jest.fn();
  mockReadStatus.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  try{
    await act(async()=>{tree=create(<CreativeResults draft={draft} onJobStatus={observed}/>);});
    await act(async()=>jest.advanceTimersByTime(7500));
    expect(mockReadStatus).toHaveBeenCalledTimes(1);
    await act(async()=>release({status:'RUNNING'}));
    expect(observed).toHaveBeenLastCalledWith('RUNNING');
    await act(async()=>jest.advanceTimersByTime(2500));
    expect(observed).toHaveBeenLastCalledWith('SUCCEEDED');
  }finally{act(()=>tree?.unmount());jest.useRealTimers();}
});

test('a successful retry clears the result-read error',async()=>{
  jest.useFakeTimers();let tree!:ReturnType<typeof create>;
  mockReadStatus.mockRejectedValueOnce(new Error('SQLITE_BUSY'));
  try{
    await act(async()=>{tree=create(<CreativeResults draft={draft}/>);});
    expect(JSON.stringify(tree.toJSON())).toContain('结果读取失败');
    await act(async()=>jest.advanceTimersByTime(2500));
    expect(JSON.stringify(tree.toJSON())).not.toContain('结果读取失败');
  }finally{act(()=>tree?.unmount());jest.useRealTimers();}
});

test('results across switched video workflows show the newest generation before an older higher per-asset version',async()=>{
  mockVersions=[{...mockVersions[0],id:'older',versionNo:9,createdAt:100,recipe:{jobId:'old'}},{...mockVersions[1],id:'newest',assetId:'second',versionNo:1,createdAt:200,recipe:{jobId:'new'}}];
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<CreativeResults draft={{...draft,job_id:null,provider_id:'autodl'}} relatedAssetIds={['second']} />);});
    const buttons=tree.root.findAll(n=>n.props.accessibilityLabel?.startsWith?.('查看版本 ') && typeof n.props.onPress==='function');
    expect(buttons.map(n=>n.props.accessibilityLabel)).toEqual(['查看版本 1','查看版本 9']);
    expect(buttons[0].props.accessibilityState.selected).toBe(true);
  }finally{act(()=>tree?.unmount());}
});

test('Enhance opens an editable draft from the selected original file size without submitting generation', async () => {
  NativeModules.AutoDLMedia = { readCreativeImageInfo: jest.fn(async()=>({width:640,height:640})) };
  let tree!:ReturnType<typeof create>;
  try {
    await act(async()=>{tree=create(<CreativeResults draft={draft} />);});
    act(()=>findButton(tree,'查看版本 1').props.onPress());
    act(()=>findButton(tree,'增强 / 放大').props.onPress());
    expect(mockExecute).not.toHaveBeenCalled();
    await act(async()=>findButton(tree,'细节增强 · Enhance，调整倍率与变化强度，重新绘制细节').props.onPress());
    expect(NativeModules.AutoDLMedia.readCreativeImageInfo).toHaveBeenCalledWith(expect.stringContaining('1.png'));
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith({name:'draft.createImage',payload:{fromVersionId:'version-1',projectId:'project',shotId:'shot',input:expect.objectContaining({enhancement:{scale:'max',sourceWidth:640,sourceHeight:640},width:640,height:640,sourceVersionId:'version-1',samples:1,strength:0.5,noise:0,seed:null})}},expect.any(String));
    expect(mockReplace).toHaveBeenCalledWith({pathname:'/image-draft/[id]',params:{id:'next'}});
  } finally {act(()=>tree?.unmount());delete NativeModules.AutoDLMedia;}
});

test('continuing edits restores the chosen version and preserves project and shot without growing the route stack', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeResults draft={draft} />); });
    expect(mockExecute).not.toHaveBeenCalled();
    act(() => findButton(tree, '查看版本 1').props.onPress());
    await act(async () => findButton(tree, '调整画面').props.onPress());
    expect(mockExecute).toHaveBeenCalledWith({ name: 'draft.createImage', payload: { fromVersionId: 'version-1', projectId: 'project', shotId: 'shot' } }, expect.any(String));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/image-draft/[id]', params: { id: 'next' } });
    expect(mockPush).not.toHaveBeenCalled();
  } finally { act(() => tree?.unmount()); }
});

test('image to video carries the chosen version into a draft without starting generation', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeResults draft={draft} />); });
    expect(findButton(tree,'制作视频')).toBeUndefined();
    act(()=>findButton(tree,'更多成果操作').props.onPress());
    await act(async () => findButton(tree, '制作视频').props.onPress());
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith({ name: 'draft.createVideo', payload: { versionId: 'version-2', projectId: 'project', shotId: 'shot' } }, expect.any(String));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/creative-draft/[id]', params: { id: 'next' } });
  } finally { act(() => tree?.unmount()); }
});

test('unknown results offer original-job investigation and never resubmit a request', async () => {
  mockStatus = 'UNKNOWN'; mockVersions = [];
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeResults draft={draft} />); });
    act(() => findButton(tree, '核查原任务').props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/creative-task/[id]', params: { id: 'job', returnToWorkbench:'1' } });
    expect(mockExecute).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('暂时无法确认结果');
    act(() => findButton(tree, '任务与草稿操作').props.onPress());
    expect(findButton(tree, '复制为新草稿（不立即生成）')).toBeDefined();
    expect(findButton(tree, '本次生成参数')).toBeDefined();
    expect(mockExecute).not.toHaveBeenCalled();
  } finally { act(() => tree?.unmount()); }
});

test('adjusting an enhanced result restores ordinary generation rather than silently enhancing again', async () => {
  mockVersions[0].recipe.input = createEnhanceInput(defaultNovelAiDraft, 'original', 640, 640);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeResults draft={draft} />); });
    await act(async () => findButton(tree,'调整画面').props.onPress());
    expect(mockExecute).toHaveBeenCalledWith({name:'draft.createImage',payload:expect.objectContaining({fromVersionId:'version-2',input:expect.objectContaining({action:'generate',enhance:false,enhancement:null,sourceVersionId:null})})},expect.any(String));
  } finally {act(()=>tree?.unmount());}
});

test('an editing draft can preview previous versions without a second set of result actions competing with generation', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeResults draft={{...draft,state:'EDITING',job_id:null}} />); });
    expect(findButton(tree,'全屏查看图片')).toBeDefined();
    expect(findButton(tree,'增强 / 放大')).toBeUndefined();
    expect(findButton(tree,'用于此镜头')).toBeUndefined();
    expect(findButton(tree,'更多成果操作')).toBeUndefined();
  } finally {act(()=>tree?.unmount());}
});

test('canvas tools use the selected version in place and a new job selects its own result', async () => {
  const enhance = jest.fn(), current = jest.fn(), status = jest.fn();
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeResults draft={draft} canvas onEnhance={enhance} onCurrentVersion={current} onJobStatus={status} historySignal={1} />); });
    act(() => findButton(tree, '查看版本 1').props.onPress());
    act(() => findButton(tree, '增强图片').props.onPress());
    expect(enhance).toHaveBeenCalledWith(mockVersions[1]);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(findButton(tree, '增强 / 放大')).toBeUndefined();
    expect(status).toHaveBeenLastCalledWith('SUCCEEDED');
    mockVersions = [{ ...mockVersions[0], id: 'new', versionNo: 3, recipe: { jobId: 'new-job' } }, ...mockVersions];
    await act(async () => { tree.update(<CreativeResults draft={{...draft,job_id:'new-job'}} canvas onEnhance={enhance} onCurrentVersion={current} onJobStatus={status} historySignal={1} />); });
    expect(current).toHaveBeenLastCalledWith(mockVersions[0]);
    expect(findButton(tree, '查看版本 1')).toBeDefined(); // Inline history stays open for continuous comparison.
  } finally { act(() => tree?.unmount()); }
});

test('history scroll lock does not freeze the result of a new generation', async () => {
  const current=jest.fn();let tree!:ReturnType<typeof create>;
  try {
    await act(async()=>{tree=create(<CreativeResults draft={draft} canvas onCurrentVersion={current} historySignal={1}/>);});
    act(()=>findButton(tree,'自动滚动到最新结果 · 点击锁定历史滚动').props.onPress());
    act(()=>findButton(tree,'查看版本 1').props.onPress());
    mockVersions=[{...mockVersions[0],id:'new',versionNo:3,recipe:{jobId:'new-job'}},...mockVersions];
    await act(async()=>tree.update(<CreativeResults draft={{...draft,job_id:'new-job'}} canvas onCurrentVersion={current} historySignal={2}/>));
    expect(current).toHaveBeenLastCalledWith(expect.objectContaining({id:'new'}));
    act(()=>findButton(tree,'已锁定历史滚动 · 点击恢复自动滚动').props.onPress());
    expect(current).toHaveBeenLastCalledWith(expect.objectContaining({id:'new'}));
  } finally {act(()=>tree?.unmount());}
});

test('canvas seed reuse uses actual output seed including zero without generating',async()=>{
  mockVersions[0].recipe.output={seed:0};const reuse=jest.fn();let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<CreativeResults draft={draft} canvas onReuse={reuse}/>);});
    act(()=>findButton(tree,'复用 Seed').props.onPress());
    expect(reuse).toHaveBeenCalledWith({seed:0});expect(mockExecute).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});

test('video task detail provides measurable playback bounds inside the scrolling results',async()=>{
 mockVersions=[{...mockVersions[0],mime:'video/mp4',relativePath:'movie.mp4'}];let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<CreativeResults draft={{...draft,provider_id:'autodl'}} taskDetail/>);});
  expect(StyleSheet.flatten(tree.root.findByProps({testID:'result-video-stage'}).props.style).height).toBeGreaterThanOrEqual(220);
  expect(tree.root.findByType(require('../media/VideoPlayer').VideoPlayer).props.source).toContain('movie.mp4');
 }finally{act(()=>tree?.unmount());}
});


test('video discovers a delayed automatic save and never shows a large save action',async()=>{
 jest.useFakeTimers();let tree!:ReturnType<typeof create>;
 mockVersions=[{...mockVersions[0],mime:'video/mp4',relativePath:'video.mp4'}];
 try{
  await act(async()=>{tree=create(<CreativeResults draft={{...draft,provider_id:'autodl',shot_id:null}} dock/>);});
  expect(findButton(tree,'保存到相册')).toBeUndefined();
  expect(findButton(tree,'保存视频到系统相册')).toBeDefined();
  mockDeliveries.mockResolvedValue([{status:'PUBLISHING',generation:1}]);
  await act(async()=>jest.advanceTimersByTime(2000));
  expect(findButton(tree,'正在保存到系统相册').props.disabled).toBe(true);
  mockDeliveries.mockResolvedValue([{status:'EXPORTED',generation:1}]);
  await act(async()=>jest.advanceTimersByTime(2000));
  expect(findButton(tree,'已保存到系统相册').props.disabled).toBe(true);
  expect(findButton(tree,'保存视频到系统相册')).toBeUndefined();
 }finally{act(()=>tree?.unmount());jest.useRealTimers();}
});


test('unchanged history does not reload recipes, but file-state changes refresh it',async()=>{
  jest.useFakeTimers();let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<CreativeResults draft={draft}/>);});
    expect(mockReadVersions).toHaveBeenCalledTimes(1);
    await act(async()=>jest.advanceTimersByTime(2500));
    expect(mockReadVersions).toHaveBeenCalledTimes(1);
    mockVersions=[{...mockVersions[0],state:'MISSING'},mockVersions[1]];
    await act(async()=>jest.advanceTimersByTime(2500));
    expect(mockReadVersions).toHaveBeenCalledTimes(2);
  }finally{act(()=>tree?.unmount());jest.useRealTimers();}
});
