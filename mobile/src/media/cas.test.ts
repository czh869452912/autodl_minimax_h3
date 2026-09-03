import { collectGarbage, createArtifactCas, type CasFiles } from './cas';

const streamOf = (...chunks: Uint8Array[]): AsyncIterable<Uint8Array> => ({ async *[Symbol.asyncIterator]() { yield* chunks; } });
const bytes = (value: string) => new TextEncoder().encode(value);

function memoryFiles(overrides: Partial<CasFiles> = {}) {
  const entries = new Map<string, Uint8Array>();
  const files: CasFiles = {
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
    ...overrides,
  };
  return { files, entries };
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
  await expect(cas.put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 10, expectedSha256: '0'.repeat(64) })).rejects.toThrow('hash');
  await expect(cas.put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 2 })).rejects.toThrow('大小');
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
    { mime: 'video/mp4', maxBytes: 20, operationId: 'download-1' },
  )).rejects.toThrow('process stopped');

  files.write = write;
  files.remove = remove;

  const result = await createArtifactCas(files, { nonce: () => 'second-process' }).put(
    streamOf(bytes('abc')),
    { mime: 'video/mp4', maxBytes: 10, operationId: 'download-1' },
  );

  expect(entries.get(result.relativePath)).toEqual(bytes('abc'));
  expect([...entries.keys()].filter((path) => path.startsWith('cas/sha256/'))).toEqual([result.relativePath]);
  expect([...entries.keys()].filter((path) => path.endsWith('.part'))).toEqual([]);
});

test('gc never deletes a referenced blob and retains rows after file deletion failure', async () => {
  const blob = { sha256: 'a'.repeat(64), byteSize: 3, mime: 'video/mp4', relativePath: 'cas/sha256/aa/blob', createdAt: 1, verifiedAt: 1 };
  let referenced = true;
  let removed = false;
  const repository = {
    listUnreferenced: jest.fn(() => referenced ? [] : [blob]),
    removeBlobIfUnreferenced: jest.fn(() => { removed = true; return true; }),
  };
  const files = { remove: jest.fn(async () => undefined) };
  expect(await collectGarbage({ repository, files, limit: 10 })).toEqual({ deleted: 0, failed: 0 });
  referenced = false;
  files.remove.mockRejectedValueOnce(new Error('busy'));
  expect(await collectGarbage({ repository, files, limit: 10 })).toEqual({ deleted: 0, failed: 1 });
  expect(removed).toBe(false);
});
