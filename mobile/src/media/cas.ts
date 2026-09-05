import CryptoJS from 'crypto-js';
import { File, FileMode } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { sha256File as nativeSha256File } from '../native/media';

export type ArtifactBlob = {
  sha256: string;
  byteSize: number;
  mime: string;
  relativePath: string;
  createdAt: number;
  verifiedAt: number;
};

export type CasFiles = {
  makeDirectory(path: string): Promise<void>;
  write(path: string, chunk: Uint8Array, append: boolean): Promise<void>;
  stat(path: string): Promise<{ exists: boolean; size?: number }>;
  move(from: string, to: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  readChunks(path: string): AsyncIterable<Uint8Array>;
};

export type ArtifactCasBlob = { sha256: string; byteSize: number; mime: string; relativePath: string };

export type NativeStagedArtifact = Readonly<{
  partUri: string;
  mime: string;
  byteSize: number;
  sha256: string;
}>;

export type ArtifactCasPutOptions = {
  mime: string;
  maxBytes: number;
  expectedSha256?: string;
  operationId?: string;
  operationAttempt?: number;
  assertLease?: () => void | Promise<void>;
};

export type StagedArtifact = ArtifactCasBlob & {
  stagedRelativePath: string;
  publish(): Promise<ArtifactCasBlob>;
  abort(): Promise<void>;
};

export type ArtifactCas = {
  adoptNativePart(input: NativeStagedArtifact, options: ArtifactCasPutOptions): Promise<StagedArtifact>;
  stage(stream: AsyncIterable<Uint8Array>, options: ArtifactCasPutOptions): Promise<StagedArtifact>;
  put(stream: AsyncIterable<Uint8Array>, options: ArtifactCasPutOptions): Promise<ArtifactCasBlob>;
};

function absolute(relativePath: string): string {
  return `${FileSystem.documentDirectory ?? ''}${relativePath}`;
}

const expoCasFiles: CasFiles = {
  makeDirectory: (path) => FileSystem.makeDirectoryAsync(absolute(path), { intermediates: true }),
  async write(path, chunk, append) { new File(absolute(path)).write(chunk, { append }); },
  async stat(path) {
    const value = await FileSystem.getInfoAsync(absolute(path));
    return value.exists && !value.isDirectory ? { exists: true, size: value.size } : { exists: false };
  },
  move: (from, to) => FileSystem.moveAsync({ from: absolute(from), to: absolute(to) }),
  copy: (from, to) => FileSystem.copyAsync({ from: absolute(from), to: absolute(to) }),
  remove: (path) => FileSystem.deleteAsync(absolute(path), { idempotent: true }),
  async *readChunks(path) {
    const handle = new File(absolute(path)).open(FileMode.ReadOnly);
    try {
      while (true) {
        const chunk = handle.readBytes(64 * 1024);
        if (chunk.byteLength === 0) break;
        yield chunk;
      }
    } finally {
      handle.close();
    }
  },
};

export async function removeCasPath(relativePath: string): Promise<void> {
  if (!/^cas\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(relativePath)) throw new Error('invalid CAS blob path');
  await expoCasFiles.remove(relativePath);
}

function wordArray(bytes: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >>> 2] = (words[index >>> 2] ?? 0) | (bytes[index] << (24 - (index % 4) * 8));
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function operationPart(operationId: string, attempt: number): string {
  const key = CryptoJS.SHA256(`${operationId}\u0000${attempt}`).toString(CryptoJS.enc.Hex);
  return `cas/parts/${key}.part`;
}

function casFailure(code: 'ARTIFACT_SIZE_REJECTED' | 'ARTIFACT_INTEGRITY_FAILED', message: string): Error {
  return Object.assign(new Error(message), { code, retryable: false });
}

async function verifyPublishedBlob(files: CasFiles, path: string, expectedSha256: string, expectedBytes: number): Promise<void> {
  const hasher = CryptoJS.algo.SHA256.create();
  let byteSize = 0;
  for await (const chunk of files.readChunks(path)) {
    if (!(chunk instanceof Uint8Array)) throw casFailure('ARTIFACT_INTEGRITY_FAILED', 'CAS reread emitted an invalid chunk');
    byteSize += chunk.byteLength;
    hasher.update(wordArray(chunk));
  }
  const sha256 = hasher.finalize().toString(CryptoJS.enc.Hex);
  if (byteSize !== expectedBytes || sha256 !== expectedSha256) {
    throw casFailure('ARTIFACT_INTEGRITY_FAILED', 'CAS durable reread mismatch');
  }
}

type VerifyBlob = (path: string, expectedSha256: string, expectedBytes: number) => Promise<void>;

type DestinationState = 'missing' | 'matching' | 'invalid';

async function inspectDestination(
  files: CasFiles,
  path: string,
  expectedSha256: string,
  expectedBytes: number,
  verify: VerifyBlob,
): Promise<DestinationState> {
  const value = await files.stat(path);
  if (!value.exists) return 'missing';
  if (value.size !== expectedBytes) return 'invalid';
  try {
    await verify(path, expectedSha256, expectedBytes);
    return 'matching';
  } catch (error) {
    if ((error as { code?: unknown } | undefined)?.code === 'ARTIFACT_INTEGRITY_FAILED') return 'invalid';
    const afterRead = await files.stat(path);
    if (!afterRead.exists) return 'missing';
    throw error;
  }
}

export function createArtifactCas(
  files: CasFiles = expoCasFiles,
  deps: {
    nonce?: () => string;
    sha256File?: (source: string) => Promise<string>;
    documentDirectory?: string;
  } = {},
): ArtifactCas {
  const nonce = deps.nonce ?? (() => `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const sha256File = deps.sha256File ?? nativeSha256File;
  const documentDirectory = deps.documentDirectory ?? FileSystem.documentDirectory ?? '';
  let quarantineSequence = 0;
  const quarantinePath = () => `cas/parts/quarantine-${nonce()}-${quarantineSequence += 1}.part`;
  const makeStaged = (
    part: string,
    blob: ArtifactCasBlob,
    options: ArtifactCasPutOptions,
    verify: VerifyBlob,
  ): StagedArtifact => {
    const { sha256, byteSize, relativePath } = blob;
    let state: 'staged' | 'publishing' | 'published' | 'aborted' = 'staged';
    return {
      ...blob,
      stagedRelativePath: part,
      async publish() {
        if (state === 'published') return blob;
        if (state !== 'staged') throw new Error(`CAS stage cannot publish while ${state}`);
        state = 'publishing';
        const quarantines: string[] = [];
        try {
          await options.assertLease?.();
          await files.makeDirectory(`cas/sha256/${sha256.slice(0, 2)}`);
          for (let attempt = 0; attempt < 4; attempt += 1) {
            let movedPart = false;
            const existing = await inspectDestination(files, relativePath, sha256, byteSize, verify);
            if (existing === 'matching') {
              await files.remove(part);
              await Promise.all(quarantines.map((path) => files.remove(path).catch(() => undefined)));
              state = 'published';
              return blob;
            }
            if (existing === 'invalid') {
              const quarantine = quarantinePath();
              try {
                await files.move(relativePath, quarantine);
                quarantines.push(quarantine);
              } catch {
                continue;
              }
            }
            try {
              await files.move(part, relativePath);
              movedPart = true;
            } catch (moveError) {
              const raced = await inspectDestination(files, relativePath, sha256, byteSize, verify);
              if (raced === 'matching') {
                await files.remove(part);
                await Promise.all(quarantines.map((path) => files.remove(path).catch(() => undefined)));
                state = 'published';
                return blob;
              }
              if (raced === 'invalid') continue;
              try {
                await files.copy(part, relativePath);
              } catch (copyError) {
                const partial = await inspectDestination(files, relativePath, sha256, byteSize, verify);
                if (partial === 'matching') {
                  await files.remove(part);
                  await Promise.all(quarantines.map((path) => files.remove(path).catch(() => undefined)));
                  state = 'published';
                  return blob;
                }
                if (partial === 'invalid') {
                  const quarantine = quarantinePath();
                  try {
                    await files.move(relativePath, quarantine);
                    quarantines.push(quarantine);
                  } catch { /* leave the target untouched when atomic ownership cannot be acquired */ }
                }
                throw Object.assign(copyError instanceof Error ? copyError : new Error(String(copyError)), { cause: moveError });
              }
            }
            const published = await inspectDestination(files, relativePath, sha256, byteSize, verify);
            if (published === 'matching') {
              await files.remove(part).catch(() => undefined);
              await Promise.all(quarantines.map((path) => files.remove(path).catch(() => undefined)));
              state = 'published';
              return blob;
            }
            if (published === 'invalid') {
              const quarantine = quarantinePath();
              try {
                await files.move(relativePath, quarantine);
                quarantines.push(quarantine);
              } catch { /* another publisher may have replaced the destination */ }
            }
            if (movedPart) throw casFailure('ARTIFACT_INTEGRITY_FAILED', 'CAS published blob durable reread mismatch');
          }
          throw casFailure('ARTIFACT_INTEGRITY_FAILED', 'CAS destination could not be repaired safely');
        } catch (error) {
          for (const quarantine of quarantines) {
            try {
              const quarantined = await inspectDestination(files, quarantine, sha256, byteSize, verify);
              if (quarantined !== 'matching') {
                await files.remove(quarantine).catch(() => undefined);
                continue;
              }
              const destination = await inspectDestination(files, relativePath, sha256, byteSize, verify);
              if (destination === 'matching') {
                await files.remove(quarantine).catch(() => undefined);
              } else if (destination === 'missing') {
                await files.move(quarantine, relativePath).catch(() => undefined);
              } else {
                const displaced = quarantinePath();
                try {
                  await files.move(relativePath, displaced);
                } catch {
                  continue;
                }
                try {
                  await files.move(quarantine, relativePath);
                } catch {
                  const raced = await inspectDestination(files, relativePath, sha256, byteSize, verify);
                  if (raced !== 'matching') {
                    const displacedState = await inspectDestination(files, displaced, sha256, byteSize, verify);
                    if (raced === 'missing' && displacedState === 'matching') {
                      await files.move(displaced, relativePath).catch(() => undefined);
                    }
                    continue;
                  }
                }
                if (await inspectDestination(files, relativePath, sha256, byteSize, verify) === 'matching') {
                  await files.remove(quarantine).catch(() => undefined);
                  await files.remove(displaced).catch(() => undefined);
                }
              }
            } catch { /* retain an unverifiable quarantine rather than delete valid bytes */ }
          }
          state = 'staged';
          throw error;
        }
      },
      async abort() {
        if (state === 'published' || state === 'aborted') return;
        if (state !== 'staged') throw new Error('CAS stage publication is in progress');
        await files.remove(part);
        state = 'aborted';
      },
    };
  };

  const streamVerify: VerifyBlob = (path, expectedSha256, expectedBytes) =>
    verifyPublishedBlob(files, path, expectedSha256, expectedBytes);

  const stage: ArtifactCas['stage'] = async (stream, options) => {
    const operationAttempt = Math.max(1, Math.floor(options.operationAttempt ?? 1));
    const part = options.operationId
      ? operationPart(options.operationId, operationAttempt)
      : `cas/parts/put-${nonce()}.part`;
    await files.makeDirectory('cas/parts');
    if (options.operationId) {
      for (let attempt = 1; attempt < operationAttempt; attempt += 1) {
        await files.remove(operationPart(options.operationId, attempt)).catch(() => undefined);
      }
    }
    try {
      const hasher = CryptoJS.algo.SHA256.create();
      let byteSize = 0;
      let append = false;
      for await (const chunk of stream) {
        if (!(chunk instanceof Uint8Array)) throw casFailure('ARTIFACT_INTEGRITY_FAILED', 'CAS stream emitted an invalid chunk');
        if (byteSize + chunk.byteLength > options.maxBytes) throw casFailure('ARTIFACT_SIZE_REJECTED', 'CAS 文件大小超过限制');
        await options.assertLease?.();
        await files.write(part, chunk, append);
        append = true;
        byteSize += chunk.byteLength;
        hasher.update(wordArray(chunk));
      }
      if (byteSize <= 0) throw casFailure('ARTIFACT_INTEGRITY_FAILED', 'CAS 文件为空');
      await options.assertLease?.();
      const sha256 = hasher.finalize().toString(CryptoJS.enc.Hex);
      if (options.expectedSha256 && options.expectedSha256.toLowerCase() !== sha256) throw casFailure('ARTIFACT_INTEGRITY_FAILED', 'CAS hash mismatch');
      await streamVerify(part, sha256, byteSize);
      return makeStaged(part, {
        sha256, byteSize, mime: options.mime, relativePath: `cas/sha256/${sha256.slice(0, 2)}/${sha256}`,
      }, options, streamVerify);
    } catch (error) {
      await files.remove(part).catch(() => undefined);
      throw error;
    }
  };

  const nativePartPath = (partUri: string, options: ArtifactCasPutOptions): string => {
    try {
      if (!documentDirectory) throw new Error('document directory unavailable');
      const root = new URL('cas/parts/', documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`);
      const candidate = new URL(partUri);
      if (candidate.protocol !== 'file:' || candidate.host !== root.host || candidate.search || candidate.hash ||
          !candidate.href.startsWith(root.href)) {
        throw new Error('native part is outside CAS parts');
      }
      const name = candidate.href.slice(root.href.length);
      if (!/^[a-f0-9]{64}\.part$/.test(name)) throw new Error('native part name is invalid');
      const part = `cas/parts/${name}`;
      if (options.operationId) {
        const attempt = options.operationAttempt ?? 1;
        if (!Number.isSafeInteger(attempt) || attempt < 0 || operationPart(options.operationId, attempt) !== part) {
          throw new Error('native part is not owned by this operation attempt');
        }
      }
      return part;
    } catch (cause) {
      throw casFailure('ARTIFACT_INTEGRITY_FAILED', cause instanceof Error ? cause.message : 'native part URI is invalid');
    }
  };

  const nativeVerify: VerifyBlob = async (path, expectedSha256, expectedBytes) => {
    const value = await files.stat(path);
    if (!value.exists || value.size !== expectedBytes) throw casFailure('ARTIFACT_INTEGRITY_FAILED', 'CAS native durable size mismatch');
    const source = new URL(path, documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`).href;
    const sha256 = await sha256File(source);
    if (!/^[a-f0-9]{64}$/i.test(sha256) || sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
      throw casFailure('ARTIFACT_INTEGRITY_FAILED', 'CAS native durable hash mismatch');
    }
  };

  const adoptNativePart: ArtifactCas['adoptNativePart'] = async (input, options) => {
    const part = nativePartPath(input.partUri, options);
    try {
      if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0) throw casFailure('ARTIFACT_INTEGRITY_FAILED', 'CAS native part size is invalid');
      if (input.byteSize > options.maxBytes) throw casFailure('ARTIFACT_SIZE_REJECTED', 'CAS 文件大小超过限制');
      if (!input.mime?.trim() || !/^[a-f0-9]{64}$/i.test(input.sha256)) throw casFailure('ARTIFACT_INTEGRITY_FAILED', 'CAS native part metadata is invalid');
      const sha256 = input.sha256.toLowerCase();
      if (options.expectedSha256 && options.expectedSha256.toLowerCase() !== sha256) throw casFailure('ARTIFACT_INTEGRITY_FAILED', 'CAS hash mismatch');
      await options.assertLease?.();
      await nativeVerify(part, sha256, input.byteSize);
      await options.assertLease?.();
      return makeStaged(part, {
        sha256, byteSize: input.byteSize, mime: input.mime, relativePath: `cas/sha256/${sha256.slice(0, 2)}/${sha256}`,
      }, options, nativeVerify);
    } catch (error) {
      await files.remove(part).catch(() => undefined);
      throw error;
    }
  };

  return {
    adoptNativePart,
    stage,
    async put(stream, options) {
      const staged = await stage(stream, options);
      try {
        return await staged.publish();
      } catch (error) {
        await staged.abort().catch(() => undefined);
        throw error;
      }
    },
  };
}

export async function collectGarbage(options: {
  repository: {
    listUnreferenced(limit: number): ArtifactBlob[];
    removeBlobIfUnreferenced(sha256: string): boolean;
    restoreBlob(blob: ArtifactBlob): void;
  };
  files: Pick<CasFiles, 'remove'>;
  limit: number;
  assertLease?: () => void;
}): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const blob of options.repository.listUnreferenced(Math.max(0, options.limit))) {
    options.assertLease?.();
    if (!options.repository.removeBlobIfUnreferenced(blob.sha256)) continue;
    try {
      options.assertLease?.();
      await options.files.remove(blob.relativePath);
      deleted += 1;
    } catch {
      options.repository.restoreBlob(blob);
      failed += 1;
    }
  }
  return { deleted, failed };
}
