import CryptoJS from 'crypto-js';
import type { ProviderAdapter } from '../workflows/providers/registry';
export type NovelAiResponseStore = {
  generate(key: string, request: string, hash: string, token: string): Promise<string>;
  lookup(key: string, hash: string): Promise<string | null>;
  importResponse(uri: string, key: string): Promise<Array<{ hash: string; seed: number; index: number }>>;
};
export const novelAiKey = (jobId: string) => CryptoJS.SHA256(`novelai:${jobId}`).toString();
export const novelAiBodyHash = (body: Record<string, unknown>) => CryptoJS.SHA256(JSON.stringify(body)).toString();
export function createNovelAiAdapter(jobId: string, token: string, store: NovelAiResponseStore): ProviderAdapter {
  const key = novelAiKey(jobId);
  return {
    manifest: () => ({ id: 'novelai-image', adapterVersion: '1', platforms: ['novelai'], capabilities: ['image.generate'], credentialKinds: ['novelai-token'], operations: ['image.generate'], supportedArtifactKinds: ['image'] }),
    validateCredentials: async () => ({ ok: Boolean(token) }),
    async submit(body) {
      const hash = novelAiBodyHash(body);
      await store.generate(key, JSON.stringify(body), hash, token);
      return { kind: 'novelai-local-response', key, requestHash: hash };
    },
    async getStatus(handle) {
      if (handle.kind !== 'novelai-local-response' || handle.key !== key || typeof handle.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(handle.requestHash)) throw new Error('NOVELAI_HANDLE_INVALID');
      const uri = await store.lookup(key, handle.requestHash);
      if (!uri) throw new Error('NOVELAI_RESPONSE_NOT_AVAILABLE');
      const images = await store.importResponse(uri, key);
      return { status: 'SUCCEEDED', artifacts: images.map(image => ({ id: `image-${image.index}`, jobId, kind: 'image', uri: `asset://${image.hash}`, mime: 'image/png', metadata: { seed: image.seed, sha256: image.hash } })) };
    },
  };
}
