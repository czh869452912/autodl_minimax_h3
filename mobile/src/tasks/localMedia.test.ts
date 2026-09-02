import type { MediaAsset } from '../media/types';
import type { TaskRecord } from './types';
import { resolveLocalVideoSource } from './localMedia';

const task: TaskRecord = {
  id: 'task-1', prompt: 'x', status: 'SUCCESS', resolution: '768p竖', duration: 5,
  localUri: 'file:///tasks-copy.mp4', createdAt: 1, updatedAt: 2,
};
const asset = {
  id: 'asset-1', taskId: 'task-1', title: 'x', prompt: 'x',
  sourceUrl: 'https://remote/video.mp4', localPath: 'file:///asset-copy.mp4',
  mimeType: 'video/mp4', status: 'downloaded', createdAt: 1, updatedAt: 2,
} satisfies MediaAsset;

test('prefers an existing asset private path', async () => {
  const getInfo = jest.fn(async (uri: string) => ({ exists: uri === 'file:///asset-copy.mp4' }));
  await expect(resolveLocalVideoSource({ task, asset }, { documentDirectory: 'file:///docs/', getInfo })).resolves.toBe('file:///asset-copy.mp4');
});

test('recovers the deterministic private download when projections are stale', async () => {
  const getInfo = jest.fn(async (uri: string) => ({ exists: uri === 'file:///docs/media/task-1.mp4' }));
  await expect(resolveLocalVideoSource({ task: { ...task, localUri: undefined }, asset: { ...asset, localPath: undefined } }, { documentDirectory: 'file:///docs/', getInfo })).resolves.toBe('file:///docs/media/task-1.mp4');
});

test('never accepts a remote URL as a local export source', async () => {
  const getInfo = jest.fn(async () => ({ exists: true }));
  await expect(resolveLocalVideoSource({ task: { ...task, localUri: 'https://remote/video.mp4' }, asset: null }, { documentDirectory: 'file:///docs/', getInfo })).resolves.toBe('file:///docs/media/task-1.mp4');
  expect(getInfo).not.toHaveBeenCalledWith('https://remote/video.mp4');
});

test('returns no local source when all private candidates are missing', async () => {
  const getInfo = jest.fn(async () => ({ exists: false }));
  await expect(resolveLocalVideoSource({ task: { ...task, localUri: undefined }, asset: null }, { documentDirectory: 'file:///docs/', getInfo })).resolves.toBeUndefined();
});
