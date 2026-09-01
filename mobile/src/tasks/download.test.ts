jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  downloadAsync: jest.fn(),
  moveAsync: jest.fn(),
}));
jest.mock('../native/media', () => ({ extractPoster: jest.fn(async () => 'file:///poster.jpg') }));

import * as FileSystem from 'expo-file-system/legacy';
import { downloadTask, nextDownloadState } from './download';
import type { TaskRecord } from './types';

const fs = FileSystem as jest.Mocked<typeof FileSystem>;
const task: TaskRecord = { id: 'task-1', prompt: 'p', status: 'SUCCESS', resolution: '768p竖', duration: 5, videoUrl: 'https://cdn.example.test/video.mp4', createdAt: 1, updatedAt: 1 };

describe('download state machine', () => {
  it('moves a successful remote task through enqueue and download states', () => {
    const task = { videoUrl: 'https://example/video.mp4' };
    expect(nextDownloadState(task, 'enqueue')).toBe('ENQUEUED');
    expect(nextDownloadState({ ...task, downloadState: 'ENQUEUED' }, 'start')).toBe('DOWNLOADING');
    expect(nextDownloadState({ ...task, downloadState: 'DOWNLOADING' }, 'success')).toBe('DOWNLOADED');
  });

  it('does not re-download an existing local file', () => {
    expect(nextDownloadState({ videoUrl: 'remote', localUri: 'file:///video.mp4' }, 'success')).toBe('DOWNLOADED');
    expect(nextDownloadState({ videoUrl: 'remote', downloadState: 'DOWNLOAD_FAILED' }, 'failure')).toBe('DOWNLOAD_FAILED');
  });
});

describe('secure artifact download', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => new Response(null, { status: 200 }));
    fs.makeDirectoryAsync.mockResolvedValue(undefined);
    fs.deleteAsync.mockResolvedValue(undefined);
    fs.moveAsync.mockResolvedValue(undefined);
  });

  it('rejects an unsafe URL before touching the filesystem downloader', async () => {
    await expect(downloadTask({ ...task, videoUrl: 'http://192.168.1.2/video.mp4' })).rejects.toThrow();
    expect(fs.downloadAsync).not.toHaveBeenCalled();
  });

  it('uses an existing local file without consulting an expired remote URL', async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: true, uri: 'file:///documents/media/task-1.mp4', size: 100, isDirectory: false, modificationTime: 1 });
    await expect(downloadTask({ ...task, videoUrl: 'http://expired.invalid/video.mp4', localUri: 'file:///documents/media/task-1.mp4' })).resolves.toMatchObject({ downloadState: 'DOWNLOADED' });
    expect(fs.downloadAsync).not.toHaveBeenCalled();
  });

  it('publishes a valid video only after response and file validation', async () => {
    fs.downloadAsync.mockResolvedValue({ uri: 'file:///documents/media/task-1.mp4.part', status: 200, headers: { 'content-type': 'video/mp4' }, mimeType: 'video/mp4' });
    fs.getInfoAsync.mockResolvedValue({ exists: true, uri: 'file:///documents/media/task-1.mp4.part', size: 100, isDirectory: false, modificationTime: 1 });
    await expect(downloadTask(task)).resolves.toMatchObject({ downloadState: 'DOWNLOADED', localUri: 'file:///documents/media/task-1.mp4' });
    expect(fs.moveAsync).toHaveBeenCalledWith({ from: 'file:///documents/media/task-1.mp4.part', to: 'file:///documents/media/task-1.mp4' });
  });

  it('deletes the partial file instead of publishing a non-video response', async () => {
    fs.downloadAsync.mockResolvedValue({ uri: 'file:///documents/media/task-1.mp4.part', status: 200, headers: { 'content-type': 'text/html' }, mimeType: 'text/html' });
    fs.getInfoAsync.mockResolvedValue({ exists: true, uri: 'file:///documents/media/task-1.mp4.part', size: 100, isDirectory: false, modificationTime: 1 });
    await expect(downloadTask(task)).rejects.toThrow('媒体类型');
    expect(fs.moveAsync).not.toHaveBeenCalled();
    expect(fs.deleteAsync).toHaveBeenCalledWith('file:///documents/media/task-1.mp4.part', { idempotent: true });
  });

  it('cancels a resumable download when streamed bytes exceed the cap', async () => {
    const cancelAsync = jest.fn(async () => undefined);
    (fs as any).createDownloadResumable = jest.fn((_url: string, _target: string, _options: unknown, callback: (value: { totalBytesWritten: number }) => void) => ({
      cancelAsync,
      downloadAsync: jest.fn(async () => {
        callback({ totalBytesWritten: 101 });
        return { uri: 'file:///documents/media/task-1.mp4.part', status: 200, headers: { 'content-type': 'video/mp4' } };
      }),
    }));
    fs.getInfoAsync.mockResolvedValue({ exists: true, uri: 'file:///documents/media/task-1.mp4.part', size: 101, isDirectory: false, modificationTime: 1 });
    await expect(downloadTask(task, { maxBytes: 100 })).rejects.toThrow('大小');
    expect(cancelAsync).toHaveBeenCalled();
    (fs as any).createDownloadResumable = undefined;
  });

});
