import { cancelArtifactTransfer, exportVideo, probeVideo, sha256File, transferArtifact } from './media';

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

describe('native artifact transfer', () => {
  const request = {
    url: 'https://cdn.example.test/video.mp4',
    allowedHosts: ['example.test'],
    allowProviderSuppliedPublicHosts: false,
    acceptedMimes: ['video/mp4'],
    maxBytes: 1024,
    connectTimeoutMs: 1_000,
    idleTimeoutMs: 1_000,
    expectedSha256: 'a'.repeat(64),
    operationId: 'operation-1',
    operationAttempt: 2,
  } as const;
  const result = {
    partUri: 'file:///data/user/0/com.example.autodlh3/files/cas/parts/hash.part',
    finalUrl: request.url,
    mime: 'video/mp4',
    byteSize: 12,
    sha256: 'a'.repeat(64),
  };

  it('passes a validated request to Android and accepts a valid native result', async () => {
    const native = { transferArtifact: jest.fn(async () => result) };
    await expect(transferArtifact(request, native as never)).resolves.toEqual(result);
    expect(native.transferArtifact).toHaveBeenCalledWith(request);
  });

  it.each([
    ['malformed hash', { ...result, sha256: 'ABC' }],
    ['non-positive byte size', { ...result, byteSize: 0 }],
    ['unexpected part URI scheme', { ...result, partUri: 'content://downloads/hash.part' }],
    ['non-HTTPS final URL', { ...result, finalUrl: 'http://cdn.example.test/video.mp4' }],
  ])('rejects a %s returned by Android', async (_case, invalid) => {
    await expect(transferArtifact(request, { transferArtifact: async () => invalid } as never))
      .rejects.toMatchObject({ code: 'ARTIFACT_TRANSFER_INVALID' });
  });

  it('rejects malformed requests before invoking Android', async () => {
    const native = { transferArtifact: jest.fn(async () => result) };
    await expect(transferArtifact({ ...request, expectedSha256: 'bad' }, native as never))
      .rejects.toMatchObject({ code: 'ARTIFACT_TRANSFER_REQUEST_INVALID' });
    await expect(transferArtifact({ ...request, maxBytes: 0 }, native as never))
      .rejects.toMatchObject({ code: 'ARTIFACT_TRANSFER_REQUEST_INVALID' });
    expect(native.transferArtifact).not.toHaveBeenCalled();
  });

  it('uses stable diagnostics when the Android module is unavailable', async () => {
    await expect(transferArtifact(request, {} as never))
      .rejects.toMatchObject({ code: 'ARTIFACT_TRANSFER_UNAVAILABLE' });
    await expect(cancelArtifactTransfer('operation-1', {} as never))
      .rejects.toMatchObject({ code: 'ARTIFACT_TRANSFER_UNAVAILABLE' });
  });

  it('cancels by non-empty operation id', async () => {
    const native = { cancelArtifactTransfer: jest.fn(async () => true) };
    await expect(cancelArtifactTransfer(' operation-1 ', native as never)).resolves.toBe(true);
    expect(native.cancelArtifactTransfer).toHaveBeenCalledWith('operation-1');
    await expect(cancelArtifactTransfer(' ', native as never))
      .rejects.toMatchObject({ code: 'ARTIFACT_TRANSFER_REQUEST_INVALID' });
  });

  it('normalizes the operation id identically for transfer and cancellation', async () => {
    const native = {
      transferArtifact: jest.fn(async () => result),
      cancelArtifactTransfer: jest.fn(async () => true),
    };

    await transferArtifact({ ...request, operationId: ' operation-1 ' }, native as never);
    await cancelArtifactTransfer(' operation-1 ', native as never);

    expect(native.transferArtifact).toHaveBeenCalledWith({ ...request, operationId: 'operation-1' });
    expect(native.cancelArtifactTransfer).toHaveBeenCalledWith('operation-1');
  });
});
