import React from 'react';
import { act, create } from 'react-test-renderer';
import { CreativeResults } from './CreativeResults';
import type { AssetVersion } from './types';
import type { CreativeDraft } from './drafts';
import {defaultNovelAiDraft} from './novelAiProtocol';
import {NativeModules} from 'react-native';
import { createEnhanceInput } from './novelAiEnhancement';
const mockPush = jest.fn(), mockReplace = jest.fn(), mockExecute = jest.fn();
let mockStatus = 'SUCCEEDED', mockVersions: AssetVersion[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('./runtime', () => ({ creativeService: () => ({ versions: async () => mockVersions, execute: mockExecute }), creativeFiles:()=>({verify:async()=>({state:'AVAILABLE'})}), exportCreativeVersion: jest.fn() }));
jest.mock('../storage/databaseClient', () => ({ getDatabase: () => ({ getFirstAsync: async () => ({ status: mockStatus }) }) }));
jest.mock('./MediaPreview', () => ({ MediaPreview: () => null }));
jest.mock('../media/VideoPlayer', () => ({ VideoPlayer: () => null }));
const draft: CreativeDraft = { id: 'draft', project_id: 'project', shot_id: 'shot', target_asset_id: 'asset', provider_id: 'novelai', workflow_id: 'image', input_json: '{}', revision: 1, state: 'SUBMITTED', job_id: 'job' };
const findButton = (tree: ReturnType<typeof create>, label: string) => tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
beforeEach(() => {
  jest.clearAllMocks(); mockStatus = 'SUCCEEDED';
  mockVersions = [2, 1].map(n => ({ id: `version-${n}`, assetId: 'asset', versionNo: n, source: 'generated', state: 'AVAILABLE', relativePath: `${n}.png`, mime: 'image/png', recipe: { jobId: 'job',input:defaultNovelAiDraft } }));
  mockExecute.mockResolvedValue({ status: 'completed', value: { draftId: 'next' } });
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
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/creative-task/[id]', params: { id: 'job' } });
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
    expect(findButton(tree, '查看版本 1')).toBeUndefined();
  } finally { act(() => tree?.unmount()); }
});
