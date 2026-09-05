import { createHash } from 'node:crypto';
import { createArtifactCas as createNativeCas, type CasFiles as NativeFiles, type ArtifactCasPutOptions } from '../media/cas';
export { collectGarbage } from '../media/cas';
export type CasFiles = NativeFiles & {
  write(path: string, chunk: Uint8Array, append: boolean): Promise<void>;
  readChunks(path: string): AsyncIterable<Uint8Array>;
};

// Stream fixture construction belongs only in tests; publication still exercises production CAS.
export function createArtifactCas(files: CasFiles, deps: Parameters<typeof createNativeCas>[1] = {}) {
  const documentDirectory = deps.documentDirectory ?? 'file:///documents/';
  const hashFile = async (source: string) => {
    const path = source.slice(documentDirectory.length);
    const hash = createHash('sha256');
    for await (const bytes of files.readChunks(path)) hash.update(bytes);
    return hash.digest('hex');
  };
  const native = createNativeCas(files, { ...deps, documentDirectory, sha256File: deps.sha256File ?? hashFile });
  const stage = async (stream: AsyncIterable<Uint8Array>, options: ArtifactCasPutOptions) => {
    const id = options.operationId ?? `test-${deps.nonce?.() ?? Math.random()}`;
    const attempt = options.operationAttempt ?? 1;
    const partFor = (n: number) => `cas/parts/${createHash('sha256').update(`${id}\u0000${n}`).digest('hex')}.part`;
    const part = partFor(attempt);
    await files.makeDirectory('cas/parts');
    for (let n = 1; n < attempt; n++) await files.remove(partFor(n));
    try {
      const hash = createHash('sha256');
      let size = 0;
      for await (const chunk of stream) {
        if (size + chunk.byteLength > options.maxBytes) throw Object.assign(new Error('size rejected'), { code: 'ARTIFACT_SIZE_REJECTED', retryable: false });
        await options.assertLease?.();
        await files.write(part, chunk, size > 0);
        hash.update(chunk); size += chunk.byteLength;
      }
      return await native.adoptNativePart({ partUri: `${documentDirectory}${part}`, mime: options.mime, byteSize: size, sha256: hash.digest('hex') }, { ...options, operationId: id, operationAttempt: attempt });
    } catch (error) { await files.remove(part).catch(() => undefined); throw error; }
  };
  return { ...native, stage, async put(stream: AsyncIterable<Uint8Array>, options: ArtifactCasPutOptions) {
    const staged = await stage(stream, options);
    try { return await staged.publish(); } catch (error) { await staged.abort().catch(() => undefined); throw error; }
  } };
}
