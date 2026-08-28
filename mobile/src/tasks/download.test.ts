import { nextDownloadState } from './download';

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
