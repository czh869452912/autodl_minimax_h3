import { exportVideo, probeVideo, sha256File } from './media';

describe('native gallery publisher', () => {
  it('passes a stable media id and file name to Android', async () => {
    const native = {
      exportVideo: jest.fn().mockResolvedValue({
        uri: 'content://media/video/7',
        displayName: 'task-1.mp4',
        relativePath: 'Movies/AutoDL-H3/',
        alreadyExisted: false,
      }),
    };
    await expect(exportVideo('file:///private.mp4', {
      mediaId: 'task-1',
      displayName: 'task-1.mp4',
    }, native as never)).resolves.toMatchObject({ uri: 'content://media/video/7' });
    expect(native.exportVideo).toHaveBeenCalledWith('file:///private.mp4', 'task-1', 'task-1.mp4');
  });

  it('rejects a blank source before invoking Android', async () => {
    await expect(exportVideo(' ', { mediaId: 'task-1' }, {} as never)).rejects.toThrow('视频源为空');
  });
});

describe('native media integrity', () => {
  it('hashes a local file and validates the lowercase SHA-256 contract', async () => {
    const native = { sha256File: jest.fn(async () => 'a'.repeat(64)) };
    await expect(sha256File('file:///video.mp4', native as never)).resolves.toBe('a'.repeat(64));
    expect(native.sha256File).toHaveBeenCalledWith('file:///video.mp4');
    await expect(sha256File('file:///video.mp4', { sha256File: async () => 'ABC' } as never)).rejects.toMatchObject({ code: 'MEDIA_INTEGRITY_INVALID' });
  });

  it('rejects blank input and missing native integrity methods', async () => {
    await expect(sha256File(' ', {} as never)).rejects.toMatchObject({ code: 'MEDIA_SOURCE_INVALID' });
    await expect(sha256File('file:///video.mp4', {} as never)).rejects.toMatchObject({ code: 'MEDIA_INTEGRITY_UNAVAILABLE' });
    await expect(probeVideo('file:///video.mp4', {} as never)).rejects.toMatchObject({ code: 'MEDIA_INTEGRITY_UNAVAILABLE' });
  });

  it('accepts only a positive, sampled, three-frame video probe', async () => {
    const valid = { durationMs: 1_000, videoTrackCount: 1, decodedFrames: 3, sampleCount: 3 };
    await expect(probeVideo('file:///video.mp4', { probeVideo: async () => valid } as never)).resolves.toEqual(valid);
    await expect(probeVideo('file:///video.mp4', { probeVideo: async () => ({ ...valid, videoTrackCount: 0, hasVideoTrack: false }) } as never)).rejects.toMatchObject({ code: 'MEDIA_INVALID' });
    await expect(probeVideo('file:///video.mp4', { probeVideo: async () => ({ ...valid, durationMs: 0 }) } as never)).rejects.toMatchObject({ code: 'MEDIA_INVALID' });
    await expect(probeVideo('file:///video.mp4', { probeVideo: async () => ({ ...valid, decodedFrames: 2 }) } as never)).rejects.toMatchObject({ code: 'MEDIA_INVALID' });
  });
});
