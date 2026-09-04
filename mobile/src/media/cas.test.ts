import { collectGarbage, createArtifactCas, type CasFiles } from './cas';

const streamOf = (...chunks: Uint8Array[]): AsyncIterable<Uint8Array> => ({ async *[Symbol.asyncIterator]() { yield* chunks; } });
const bytes = (value: string) => new TextEncoder().encode(value);

function memoryFiles(overrides: Partial<CasFiles> & Record<string, unknown> = {}) {
  const entries = new Map<string, Uint8Array>();
  const files = {
    makeDirectory: jest.fn(async () => undefined),
    write: jest.fn(async (path, chunk, append) => {
      const previous = append ? entries.get(path) ?? new Uint8Array() : new Uint8Array();
      const combined = new Uint8Array(previous.length + chunk.length);
      combined.set(previous); combined.set(chunk, previous.length); entries.set(path, combined);
    }),
    stat: jest.fn(async (path) => entries.has(path) ? { exists: true, size: entries.get(path)!.byteLength } : { exists: false }),
    move: jest.fn(async (from, to) => { const value = entries.get(from); if (!value) throw new Error('missing'); entries.set(to, value); entries.delete(from); }),
    copy: jest.fn(async (from, to) => { const value = entries.get(from); if (!value) throw new Error('missing'); entries.set(to, value.slice()); }),
    remove: jest.fn(async (path) => { entries.delete(path); }),
    async *readChunks(path: string) {
      const value = entries.get(path);
      if (!value) throw new Error('missing');
      yield value.slice();
    },
    ...overrides,
  };
  return { files: files as CasFiles, entries };
}

test('publishes by computed sha256 and removes the part', async () => {
  const { files, entries } = memoryFiles();
  const cas = createArtifactCas(files, { nonce: () => 'nonce' });
  const result = await cas.put(streamOf(bytes('a'), bytes('bc')), { mime: 'video/mp4', maxBytes: 10, operationId: 'op-1' });
  expect(result.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(result.relativePath).toBe(`cas/sha256/ba/${result.sha256}`);
  expect([...entries.keys()].filter((path) => path.startsWith('cas/parts'))).toEqual([]);
});

test('rejects expected hash mismatch and byte overflow without retaining a part', async () => {
  const { files, entries } = memoryFiles();
  const cas = createArtifactCas(files, { nonce: () => 'nonce' });
  await expect(cas.put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 10, expectedSha256: '0'.repeat(64) })).rejects.toMatchObject({ code: 'ARTIFACT_INTEGRITY_FAILED', retryable: false });
  await expect(cas.put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 2 })).rejects.toMatchObject({ code: 'ARTIFACT_SIZE_REJECTED', retryable: false });
  expect([...entries.keys()].filter((path) => path.endsWith('.part'))).toEqual([]);
});

test('uses a verified copy fallback when atomic rename is unavailable', async () => {
  const base = memoryFiles();
  base.files.move = jest.fn(async () => { throw new Error('rename unavailable'); });
  const result = await createArtifactCas(base.files, { nonce: () => 'nonce' }).put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 10 });
  expect(base.files.copy).toHaveBeenCalled();
  expect(await base.files.stat(result.relativePath)).toEqual({ exists: true, size: 3 });
  expect([...base.entries.keys()].filter((path) => path.endsWith('.part'))).toEqual([]);
});

test('rejects a published blob when a durable reread does not match the streamed bytes', async () => {
  const base = memoryFiles({
    async *readChunks() { yield bytes('abd'); },
  });
  await expect(createArtifactCas(base.files, { nonce: () => 'nonce' }).put(
    streamOf(bytes('abc')),
    { mime: 'video/mp4', maxBytes: 10 },
  )).rejects.toMatchObject({ code: 'ARTIFACT_INTEGRITY_FAILED', retryable: false });
  expect([...base.entries.keys()].filter((path) => path.startsWith('cas/sha256/'))).toEqual([]);
});

test('durably rereads an existing matching blob before reusing it', async () => {
  const base = memoryFiles();
  const cas = createArtifactCas(base.files, { nonce: () => 'nonce' });
  const first = await cas.put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 10 });
  const second = await cas.put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 10 });
  expect(second).toEqual(first);
  expect((base.files as CasFiles & { readChunks: jest.Mock }).readChunks).toBeDefined();
});

test('concurrent publishers of the same hash converge on one verified destination', async () => {
  const { files, entries } = memoryFiles();
  let nonce = 0;
  const cas = createArtifactCas(files, { nonce: () => String(nonce += 1) });
  const [first, second] = await Promise.all([
    cas.put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 10, operationId: 'one' }),
    cas.put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 10, operationId: 'two' }),
  ]);
  expect(second.relativePath).toBe(first.relativePath);
  expect(entries.get(first.relativePath)).toEqual(bytes('abc'));
  expect([...entries.keys()].filter((path) => path.endsWith('.part'))).toEqual([]);
});

test('keeps a part cleanup boundary when writing or publishing fails', async () => {
  const writeFailure = memoryFiles({ write: jest.fn(async () => { throw new Error('write failed'); }) });
  await expect(createArtifactCas(writeFailure.files).put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 10 })).rejects.toThrow('write failed');
  expect(writeFailure.files.remove).toHaveBeenCalledWith(expect.stringContaining('.part'));

  const publishFailure = memoryFiles();
  publishFailure.files.move = jest.fn(async () => { throw new Error('move'); });
  publishFailure.files.copy = jest.fn(async () => { throw new Error('copy'); });
  await expect(createArtifactCas(publishFailure.files).put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 10 })).rejects.toThrow('copy');
  expect([...publishFailure.entries.keys()].filter((path) => path.endsWith('.part'))).toEqual([]);
});

test('a restarted operation replaces its abandoned part and publishes one blob', async () => {
  const { files, entries } = memoryFiles();
  const write = files.write;
  const remove = files.remove;
  files.write = jest.fn(async (...args) => {
    await write(...args);
    throw new Error('process stopped');
  });
  files.remove = jest.fn(async () => { throw new Error('process already gone'); });
  await expect(createArtifactCas(files, { nonce: () => 'first-process' }).put(
    streamOf(bytes('interrupted')),
    { mime: 'video/mp4', maxBytes: 20, operationId: 'download-1', operationAttempt: 1 } as never,
  )).rejects.toThrow('process stopped');

  files.write = write;
  files.remove = remove;

  const result = await createArtifactCas(files, { nonce: () => 'second-process' }).put(
    streamOf(bytes('abc')),
    { mime: 'video/mp4', maxBytes: 10, operationId: 'download-1', operationAttempt: 2 } as never,
  );

  expect(entries.get(result.relativePath)).toEqual(bytes('abc'));
  expect([...entries.keys()].filter((path) => path.startsWith('cas/sha256/'))).toEqual([result.relativePath]);
  expect([...entries.keys()].filter((path) => path.endsWith('.part'))).toEqual([]);
});

test('expired and replacement attempts never interleave writes to one part', async () => {
  const { files, entries } = memoryFiles();
  const cas = createArtifactCas(files);
  const [expired, replacement] = await Promise.all([
    cas.put(streamOf(bytes('a'), bytes('bc')), {
      mime: 'video/mp4', maxBytes: 10, operationId: 'download-race', operationAttempt: 1,
    } as never),
    cas.put(streamOf(bytes('x'), bytes('yz')), {
      mime: 'video/mp4', maxBytes: 10, operationId: 'download-race', operationAttempt: 2,
    } as never),
  ]);

  expect(entries.get(expired.relativePath)).toEqual(bytes('abc'));
  expect(entries.get(replacement.relativePath)).toEqual(bytes('xyz'));
});

test('gc never deletes a referenced blob and restores rows after file deletion failure', async () => {
  const blob = { sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: 'cas/sha256/aa/blob', createdAt: 1, verifiedAt: 1 };
  let referenced = true;
  let removed = false;
  const repository = {
    listUnreferenced: jest.fn(() => referenced ? [] : [blob]),
    removeBlobIfUnreferenced: jest.fn(() => { removed = true; return true; }),
    restoreBlob: jest.fn(() => { removed = false; }),
  };
  const files = { remove: jest.fn(async () => undefined) };
  expect(await collectGarbage({ repository, files, limit: 10 })).toEqual({ deleted: 0, failed: 0 });
  referenced = false;
  files.remove.mockRejectedValueOnce(new Error('busy'));
  expect(await collectGarbage({ repository, files, limit: 10 })).toEqual({ deleted: 0, failed: 1 });
  expect(removed).toBe(false);
  expect(repository.restoreBlob).toHaveBeenCalledWith(blob);
});

test('gc never removes the file when the blob becomes referenced before deletion', async () => {
  const blob = { sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: 'cas/sha256/aa/blob', createdAt: 1, verifiedAt: 1 };
  const repository = {
    listUnreferenced: jest.fn(() => [blob]),
    removeBlobIfUnreferenced: jest.fn(() => false),
    restoreBlob: jest.fn(),
  };
  const files = { remove: jest.fn(async () => undefined) };
  await expect(collectGarbage({ repository, files, limit: 1 })).resolves.toEqual({ deleted: 0, failed: 0 });
  expect(repository.removeBlobIfUnreferenced).toHaveBeenCalledWith(blob.sha256);
  expect(files.remove).not.toHaveBeenCalled();
});

test('gc restores blob metadata when physical deletion fails', async () => {
  const blob = { sha256: 'b'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: 'cas/sha256/bb/blob', createdAt: 1, verifiedAt: 1 };
  const repository = {
    listUnreferenced: jest.fn(() => [blob]),
    removeBlobIfUnreferenced: jest.fn(() => true),
    restoreBlob: jest.fn(),
  };
  const files = { remove: jest.fn(async () => { throw new Error('busy'); }) };
  await expect(collectGarbage({ repository, files, limit: 1 })).resolves.toEqual({ deleted: 0, failed: 1 });
  expect(repository.restoreBlob).toHaveBeenCalledWith(blob);
});
