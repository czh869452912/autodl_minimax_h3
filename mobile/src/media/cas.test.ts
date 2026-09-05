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
    readChunks: jest.fn(async function* (path: string) {
      const value = entries.get(path);
      if (!value) throw new Error('missing');
      yield value.slice();
    }),
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

test('removes a newly published destination when only its final durable reread is corrupt', async () => {
  const base = memoryFiles();
  const move = base.files.move;
  base.files.move = jest.fn(async (from, to) => {
    await move(from, to);
    if (to.startsWith('cas/sha256/')) base.entries.set(to, bytes('abd'));
  });

  await expect(createArtifactCas(base.files, { nonce: () => 'corrupt-final' }).put(
    streamOf(bytes('abc')),
    { mime: 'video/mp4', maxBytes: 10 },
  )).rejects.toMatchObject({ code: 'ARTIFACT_INTEGRITY_FAILED', retryable: false });
  expect([...base.entries.keys()].filter((path) => path.startsWith('cas/sha256/'))).toEqual([]);
  expect([...base.entries.keys()].filter((path) => path.startsWith('cas/parts/'))).toEqual([]);
});

test('durably rereads an existing matching blob before reusing it', async () => {
  const base = memoryFiles();
  const cas = createArtifactCas(base.files, { nonce: () => 'nonce' });
  const first = await cas.put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 10 });
  const second = await cas.put(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 10 });
  expect(second).toEqual(first);
  expect((base.files as CasFiles & { readChunks: jest.Mock }).readChunks).toBeDefined();
});

test.each([
  ['the wrong size', bytes('broken')],
  ['the same size but wrong hash', bytes('abd')],
])('repairs a pre-existing hash path containing %s', async (_description, poisoned) => {
  const base = memoryFiles();
  const sha256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const relativePath = `cas/sha256/ba/${sha256}`;
  base.entries.set(relativePath, poisoned);

  const result = await createArtifactCas(base.files, { nonce: () => 'repair' }).put(
    streamOf(bytes('abc')),
    { mime: 'video/mp4', maxBytes: 10 },
  );

  expect(result.relativePath).toBe(relativePath);
  expect(base.entries.get(relativePath)).toEqual(bytes('abc'));
  expect([...base.entries.keys()].filter((path) => path.startsWith('cas/parts/'))).toEqual([]);
});

test('repairs an invalid destination created by a racing publisher', async () => {
  const base = memoryFiles();
  const sha256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const relativePath = `cas/sha256/ba/${sha256}`;
  const move = base.files.move;
  let injectedRace = false;
  base.files.move = jest.fn(async (from, to) => {
    if (!injectedRace && from.startsWith('cas/parts/') && to === relativePath) {
      injectedRace = true;
      base.entries.set(relativePath, bytes('abd'));
      throw new Error('destination appeared');
    }
    await move(from, to);
  });

  const result = await createArtifactCas(base.files, { nonce: () => 'race' }).put(
    streamOf(bytes('abc')),
    { mime: 'video/mp4', maxBytes: 10 },
  );

  expect(result.relativePath).toBe(relativePath);
  expect(base.entries.get(relativePath)).toEqual(bytes('abc'));
  expect([...base.entries.keys()].filter((path) => path.startsWith('cas/parts/'))).toEqual([]);
});

test('cleans an invalid quarantine when repairing the destination later fails', async () => {
  const base = memoryFiles();
  const sha256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const relativePath = `cas/sha256/ba/${sha256}`;
  base.entries.set(relativePath, bytes('abd'));
  const move = base.files.move;
  base.files.move = jest.fn(async (from, to) => {
    if (from.startsWith('cas/parts/') && !from.includes('quarantine-') && to === relativePath) throw new Error('publish unavailable');
    await move(from, to);
  });
  base.files.copy = jest.fn(async () => { throw new Error('copy unavailable'); });

  await expect(createArtifactCas(base.files, { nonce: () => 'failed-repair' }).put(
    streamOf(bytes('abc')),
    { mime: 'video/mp4', maxBytes: 10 },
  )).rejects.toThrow('copy unavailable');
  expect(base.entries.has(relativePath)).toBe(false);
  expect([...base.entries.keys()].filter((path) => path.startsWith('cas/parts/'))).toEqual([]);
});

test('restores a valid blob quarantined by a race when publication fails', async () => {
  const base = memoryFiles();
  const sha256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const relativePath = `cas/sha256/ba/${sha256}`;
  base.entries.set(relativePath, bytes('abd'));
  const move = base.files.move;
  base.files.move = jest.fn(async (from, to) => {
    if (from === relativePath && to.includes('quarantine-')) base.entries.set(relativePath, bytes('abc'));
    if (from.startsWith('cas/parts/') && !from.includes('quarantine-') && to === relativePath) throw new Error('publish unavailable');
    await move(from, to);
  });
  base.files.copy = jest.fn(async (_from, to) => {
    base.entries.set(to, bytes('abd'));
    throw new Error('copy corrupted');
  });

  await expect(createArtifactCas(base.files, { nonce: () => 'restore-race' }).put(
    streamOf(bytes('abc')),
    { mime: 'video/mp4', maxBytes: 10 },
  )).rejects.toThrow('copy corrupted');
  expect(base.entries.get(relativePath)).toEqual(bytes('abc'));
  expect([...base.entries.keys()].filter((path) => path.startsWith('cas/parts/'))).toEqual([]);
});

test('aborting a staged put removes only its owned part and preserves a concurrent valid destination', async () => {
  const base = memoryFiles();
  const sha256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const relativePath = `cas/sha256/ba/${sha256}`;
  base.entries.set(relativePath, bytes('abc'));
  const cas = createArtifactCas(base.files, { nonce: () => 'staged' });

  const staged = await cas.stage(streamOf(bytes('abc')), { mime: 'video/mp4', maxBytes: 10 });
  expect(base.entries.get(staged.stagedRelativePath)).toEqual(bytes('abc'));
  await staged.abort();

  expect(base.entries.get(relativePath)).toEqual(bytes('abc'));
  expect(base.entries.has(staged.stagedRelativePath)).toBe(false);
});

const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const ABD_SHA256 = 'a52d159f262b2c6ddb724a61840befc36eb30c88877a4030b65cbe86298449c9';
const DOWNLOAD_PART = 'cas/parts/898f18c03e478384b0617b16a607c3935b0b555652951873aecc88ab0850a3c3.part';
const DOCUMENT_DIRECTORY = 'file:///documents/';

function nativeSha256(entries: Map<string, Uint8Array>) {
  return jest.fn(async (uri: string) => {
    const relativePath = uri.startsWith(DOCUMENT_DIRECTORY) ? uri.slice(DOCUMENT_DIRECTORY.length) : '';
    const value = entries.get(relativePath);
    if (!value) throw new Error('missing');
    return new TextDecoder().decode(value) === 'abc' ? ABC_SHA256 : ABD_SHA256;
  });
}

test('adopts the owned native part with native rereads and case-insensitive provider hash matching', async () => {
  const base = memoryFiles();
  base.entries.set(DOWNLOAD_PART, bytes('abc'));
  const sha256File = nativeSha256(base.entries);
  const staged = await createArtifactCas(base.files, { sha256File, documentDirectory: DOCUMENT_DIRECTORY }).adoptNativePart({
    partUri: `${DOCUMENT_DIRECTORY}${DOWNLOAD_PART}`,
    mime: 'video/mp4',
    byteSize: 3,
    sha256: ABC_SHA256,
  }, {
    mime: 'video/mp4', maxBytes: 10, expectedSha256: ABC_SHA256.toUpperCase(),
    operationId: 'download-1', operationAttempt: 1,
  });

  expect(staged.stagedRelativePath).toBe(DOWNLOAD_PART);
  await expect(staged.publish()).resolves.toMatchObject({ sha256: ABC_SHA256, byteSize: 3 });
  expect(base.entries.get(`cas/sha256/ba/${ABC_SHA256}`)).toEqual(bytes('abc'));
  expect(sha256File).toHaveBeenCalledWith(`${DOCUMENT_DIRECTORY}${DOWNLOAD_PART}`);
  expect(base.files.write).not.toHaveBeenCalled();
  expect(base.files.readChunks).not.toHaveBeenCalled();
});

test('rejects a native part outside the owned operation path without deleting it', async () => {
  const base = memoryFiles();
  base.entries.set('outside.part', bytes('abc'));
  const cas = createArtifactCas(base.files, {
    sha256File: nativeSha256(base.entries), documentDirectory: DOCUMENT_DIRECTORY,
  });

  await expect(cas.adoptNativePart({
    partUri: `${DOCUMENT_DIRECTORY}outside.part`, mime: 'video/mp4', byteSize: 3, sha256: ABC_SHA256,
  }, {
    mime: 'video/mp4', maxBytes: 10, operationId: 'download-1', operationAttempt: 1,
  })).rejects.toMatchObject({ code: 'ARTIFACT_INTEGRITY_FAILED' });

  expect(base.entries.get('outside.part')).toEqual(bytes('abc'));
  expect(base.files.remove).not.toHaveBeenCalledWith('outside.part');
});

test.each([
  ['missing ownership', {}],
  ['blank operation id', { operationId: ' ', operationAttempt: 1 }],
  ['incorrect operation attempt', { operationId: 'download-1', operationAttempt: 2 }],
])('rejects %s before touching the claimed native part', async (_case, ownership) => {
  const base = memoryFiles();
  base.entries.set(DOWNLOAD_PART, bytes('abc'));
  const sha256File = nativeSha256(base.entries);
  const cas = createArtifactCas(base.files, { sha256File, documentDirectory: DOCUMENT_DIRECTORY });

  await expect(cas.adoptNativePart({
    partUri: `${DOCUMENT_DIRECTORY}${DOWNLOAD_PART}`, mime: 'video/mp4', byteSize: 3, sha256: ABC_SHA256,
  }, {
    mime: 'video/mp4', maxBytes: 10, ...ownership,
  } as never)).rejects.toMatchObject({ code: 'ARTIFACT_INTEGRITY_FAILED' });

  expect(base.entries.get(DOWNLOAD_PART)).toEqual(bytes('abc'));
  expect(base.files.stat).not.toHaveBeenCalled();
  expect(base.files.remove).not.toHaveBeenCalled();
  expect(sha256File).not.toHaveBeenCalled();
});

test.each([
  ['reported size differs from disk', 4, ABC_SHA256],
  ['native durable hash differs from the transfer hash', 3, ABD_SHA256],
])('rejects a native part when %s and removes only the owned part', async (_case, byteSize, durableSha256) => {
  const base = memoryFiles();
  base.entries.set(DOWNLOAD_PART, bytes('abc'));
  base.entries.set('cas/parts/other-operation.part', bytes('other'));
  const cas = createArtifactCas(base.files, {
    sha256File: jest.fn(async () => durableSha256), documentDirectory: DOCUMENT_DIRECTORY,
  });

  await expect(cas.adoptNativePart({
    partUri: `${DOCUMENT_DIRECTORY}${DOWNLOAD_PART}`, mime: 'video/mp4', byteSize, sha256: ABC_SHA256,
  }, {
    mime: 'video/mp4', maxBytes: 10, operationId: 'download-1', operationAttempt: 1,
  })).rejects.toMatchObject({ code: 'ARTIFACT_INTEGRITY_FAILED' });

  expect(base.entries.has(DOWNLOAD_PART)).toBe(false);
  expect(base.entries.get('cas/parts/other-operation.part')).toEqual(bytes('other'));
});

test('native adoption preserves destination quarantine repair without JavaScript rereads', async () => {
  const base = memoryFiles();
  const destination = `cas/sha256/ba/${ABC_SHA256}`;
  base.entries.set(DOWNLOAD_PART, bytes('abc'));
  base.entries.set(destination, bytes('abd'));
  const sha256File = nativeSha256(base.entries);

  const staged = await createArtifactCas(base.files, { sha256File, documentDirectory: DOCUMENT_DIRECTORY, nonce: () => 'native' }).adoptNativePart({
    partUri: `${DOCUMENT_DIRECTORY}${DOWNLOAD_PART}`, mime: 'video/mp4', byteSize: 3, sha256: ABC_SHA256,
  }, {
    mime: 'video/mp4', maxBytes: 10, operationId: 'download-1', operationAttempt: 1,
  });
  await staged.publish();

  expect(base.entries.get(destination)).toEqual(bytes('abc'));
  expect([...base.entries.keys()].filter((path) => path.startsWith('cas/parts/'))).toEqual([]);
  expect(base.files.readChunks).not.toHaveBeenCalled();
});

test('lease loss aborts native publication and preserves published and foreign parts', async () => {
  const base = memoryFiles();
  const destination = `cas/sha256/ba/${ABC_SHA256}`;
  base.entries.set(DOWNLOAD_PART, bytes('abc'));
  base.entries.set(destination, bytes('abc'));
  base.entries.set('cas/parts/foreign.part', bytes('foreign'));
  let leaseChecks = 0;
  const staged = await createArtifactCas(base.files, {
    sha256File: nativeSha256(base.entries), documentDirectory: DOCUMENT_DIRECTORY,
  }).adoptNativePart({
    partUri: `${DOCUMENT_DIRECTORY}${DOWNLOAD_PART}`, mime: 'video/mp4', byteSize: 3, sha256: ABC_SHA256,
  }, {
    mime: 'video/mp4', maxBytes: 10, operationId: 'download-1', operationAttempt: 1,
    assertLease: () => { leaseChecks += 1; if (leaseChecks >= 3) throw new Error('lease lost'); },
  });

  await expect(staged.publish()).rejects.toThrow('lease lost');
  await staged.abort();

  expect(base.entries.get(destination)).toEqual(bytes('abc'));
  expect(base.entries.get('cas/parts/foreign.part')).toEqual(bytes('foreign'));
  expect(base.entries.has(DOWNLOAD_PART)).toBe(false);
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

test('quarantines and cleans a partially copied destination when copy throws', async () => {
  const base = memoryFiles();
  const move = base.files.move;
  base.files.move = jest.fn(async (from, to) => {
    if (from.startsWith('cas/parts/') && !from.includes('quarantine-') && to.startsWith('cas/sha256/')) throw new Error('rename unavailable');
    await move(from, to);
  });
  base.files.copy = jest.fn(async (_from, to) => {
    base.entries.set(to, bytes('abd'));
    throw new Error('copy interrupted');
  });

  await expect(createArtifactCas(base.files, { nonce: () => 'partial-copy' }).put(
    streamOf(bytes('abc')),
    { mime: 'video/mp4', maxBytes: 10 },
  )).rejects.toThrow('copy interrupted');
  expect([...base.entries.keys()].filter((path) => path.startsWith('cas/sha256/'))).toEqual([]);
  expect([...base.entries.keys()].filter((path) => path.startsWith('cas/parts/'))).toEqual([]);
});

test('quarantines and cleans a silently corrupted destination after copy reports success', async () => {
  const base = memoryFiles();
  const move = base.files.move;
  base.files.move = jest.fn(async (from, to) => {
    if (from.startsWith('cas/parts/') && !from.includes('quarantine-') && to.startsWith('cas/sha256/')) {
      throw new Error('rename unavailable');
    }
    await move(from, to);
  });
  base.files.copy = jest.fn(async (_from, to) => { base.entries.set(to, bytes('abd')); });

  await expect(createArtifactCas(base.files, { nonce: () => 'silent-copy-corruption' }).put(
    streamOf(bytes('abc')),
    { mime: 'video/mp4', maxBytes: 10 },
  )).rejects.toMatchObject({ code: 'ARTIFACT_INTEGRITY_FAILED' });
  expect([...base.entries.keys()].filter((path) => path.startsWith('cas/sha256/'))).toEqual([]);
  expect([...base.entries.keys()].filter((path) => path.startsWith('cas/parts/'))).toEqual([]);
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
