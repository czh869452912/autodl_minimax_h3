import React from 'react';
import { act, create } from 'react-test-renderer';
import { CreativeResults } from './CreativeResults';
import type { AssetVersion } from './types';
import type { CreativeDraft } from './drafts';
import {defaultNovelAiDraft} from './novelAiProtocol';
const mockPush = jest.fn(), mockReplace = jest.fn(), mockExecute = jest.fn();
let mockStatus = 'SUCCEEDED', mockVersions: AssetVersion[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('./runtime', () => ({ creativeService: () => ({ versions: async () => mockVersions, execute: mockExecute }), exportCreativeVersion: jest.fn() }));
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

test('continuing edits restores the chosen version and preserves project and shot without growing the route stack', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeResults draft={draft} />); });
    expect(mockExecute).not.toHaveBeenCalled();
    act(() => findButton(tree, '查看版本 1').props.onPress());
    await act(async () => findButton(tree, '继续修改').props.onPress());
    expect(mockExecute).toHaveBeenCalledWith({ name: 'draft.createImage', payload: { fromVersionId: 'version-1', projectId: 'project', shotId: 'shot' } }, expect.any(String));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/image-draft/[id]', params: { id: 'next' } });
    expect(mockPush).not.toHaveBeenCalled();
  } finally { act(() => tree?.unmount()); }
});

test('image to video carries the chosen version into a draft without starting generation', async () => {
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CreativeResults draft={draft} />); });
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
  } finally { act(() => tree?.unmount()); }
});
