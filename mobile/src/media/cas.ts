import CryptoJS from 'crypto-js';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';

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
};

export type ArtifactCas = {
  put(
    stream: AsyncIterable<Uint8Array>,
    options: {
      mime: string;
      maxBytes: number;
      expectedSha256?: string;
      operationId?: string;
      operationAttempt?: number;
      assertLease?: () => void | Promise<void>;
    },
  ): Promise<{ sha256: string; byteSize: number; mime: string; relativePath: string }>;
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

export function createArtifactCas(
  files: CasFiles = expoCasFiles,
  deps: { nonce?: () => string } = {},
): ArtifactCas {
  const nonce = deps.nonce ?? (() => `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return {
    async put(stream, options) {
      const operationAttempt = Math.max(1, Math.floor(options.operationAttempt ?? 1));
      const part = options.operationId
        ? operationPart(options.operationId, operationAttempt)
        : `cas/parts/put-${nonce()}.part`;
      let publishedByCopy: string | undefined;
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
          if (!(chunk instanceof Uint8Array)) throw new Error('CAS stream emitted an invalid chunk');
          if (byteSize + chunk.byteLength > options.maxBytes) throw new Error('CAS 文件大小超过限制');
          await options.assertLease?.();
          await files.write(part, chunk, append);
          append = true;
          byteSize += chunk.byteLength;
          hasher.update(wordArray(chunk));
        }
        if (byteSize <= 0) throw new Error('CAS 文件为空');
        await options.assertLease?.();
        const sha256 = hasher.finalize().toString(CryptoJS.enc.Hex);
        if (options.expectedSha256 && options.expectedSha256.toLowerCase() !== sha256) throw new Error('CAS hash mismatch');
        const relativePath = `cas/sha256/${sha256.slice(0, 2)}/${sha256}`;
        await files.makeDirectory(`cas/sha256/${sha256.slice(0, 2)}`);
        const existing = await files.stat(relativePath);
        if (existing.exists) {
          if (existing.size !== byteSize) throw new Error('CAS existing blob size mismatch');
          await files.remove(part);
          return { sha256, byteSize, mime: options.mime, relativePath };
        }
        try {
          await files.move(part, relativePath);
        } catch (moveError) {
          const raced = await files.stat(relativePath);
          if (raced.exists && raced.size === byteSize) {
            await files.remove(part);
            return { sha256, byteSize, mime: options.mime, relativePath };
          }
          try {
            publishedByCopy = relativePath;
            await files.copy(part, relativePath);
          } catch (copyError) {
            throw Object.assign(copyError instanceof Error ? copyError : new Error(String(copyError)), { cause: moveError });
          }
          const copied = await files.stat(relativePath);
          if (!copied.exists || copied.size !== byteSize) throw new Error('CAS copied blob size mismatch');
          await files.remove(part);
        }
        const published = await files.stat(relativePath);
        if (!published.exists || published.size !== byteSize) throw new Error('CAS published blob size mismatch');
        return { sha256, byteSize, mime: options.mime, relativePath };
      } catch (error) {
        await files.remove(part).catch(() => undefined);
        if (publishedByCopy) await files.remove(publishedByCopy).catch(() => undefined);
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
}): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const blob of options.repository.listUnreferenced(Math.max(0, options.limit))) {
    if (!options.repository.removeBlobIfUnreferenced(blob.sha256)) continue;
    try {
      await options.files.remove(blob.relativePath);
      deleted += 1;
    } catch {
      options.repository.restoreBlob(blob);
      failed += 1;
    }
  }
  return { deleted, failed };
}
