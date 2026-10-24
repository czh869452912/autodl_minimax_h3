import CryptoJS from 'crypto-js';
import type { ProviderAdapter } from '../workflows/providers/registry';
import {isNovelAiUpscaleRequest,upscaleExpectedSize} from './novelAiUpscale';
export type NovelAiResponseStore = {
  generate(key: string, request: string, hash: string, token: string): Promise<string>;
  upscale?(key: string, request: string, hash: string, token: string): Promise<string>;
  lookup(key: string, hash: string): Promise<string | null>;
  importResponse(uri: string, key: string, upscale?:boolean): Promise<Array<{ hash: string; seed?: number; index: number; width?: number; height?: number }>>;
};
export const novelAiKey = (jobId: string) => CryptoJS.SHA256(`novelai:${jobId}`).toString();
export const novelAiBodyHash = (body: Record<string, unknown>) => CryptoJS.SHA256(JSON.stringify(body)).toString();
export function createNovelAiAdapter(jobId: string, token: string, store: NovelAiResponseStore): ProviderAdapter {
  const key = novelAiKey(jobId);
  return {
    manifest: () => ({ id: 'novelai-image', adapterVersion: '1', platforms: ['novelai'], capabilities: ['image.generate'], credentialKinds: ['novelai-token'], operations: ['image.generate'], supportedArtifactKinds: ['image'] }),
    validateCredentials: async () => ({ ok: Boolean(token) }),
    async submit(body) {
      const upscale=isNovelAiUpscaleRequest(body);
      const outputSize=upscale?upscaleExpectedSize(body):undefined;
      const expectedImages=(body.parameters as {n_samples?:number}|undefined)?.n_samples??1;
      if(!Number.isInteger(expectedImages) || expectedImages<1 || expectedImages>4)throw new Error('NOVELAI_SAMPLE_COUNT_INVALID');
      const hash = novelAiBodyHash(body);
      if(upscale){if(!store.upscale)throw new Error('请安装支持超分的新版 Android 应用');await store.upscale(key,JSON.stringify(body),hash,token);}
      else await store.generate(key, JSON.stringify(body), hash, token);
      return { kind: 'novelai-local-response', key, requestHash: hash, expectedImages, ...(upscale?{operation:'upscale',outputSize}:{}) };
    },
    async getStatus(handle) {
      if (handle.kind !== 'novelai-local-response' || handle.key !== key || typeof handle.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(handle.requestHash)) throw new Error('NOVELAI_HANDLE_INVALID');
      const uri = await store.lookup(key, handle.requestHash);
      if (!uri) throw new Error('NOVELAI_RESPONSE_NOT_AVAILABLE');
      const images = handle.operation==='upscale'?await store.importResponse(uri,key,true):await store.importResponse(uri, key);
      if(handle.operation==='upscale'){
        const size=handle.outputSize as {width?:number;height?:number}|undefined;
        if(!size || !Number.isInteger(size.width) || !Number.isInteger(size.height) || images.some(image=>image.width!==size.width || image.height!==size.height))throw new Error('NOVELAI_UPSCALE_OUTPUT_SIZE_MISMATCH');
      }
      const expectedImages=typeof handle.expectedImages==='number'?handle.expectedImages:1;
      if(!Number.isInteger(expectedImages) || expectedImages<1 || expectedImages>4)throw new Error('NOVELAI_HANDLE_INVALID');
      return { status: images.length===expectedImages && images.every(i=>i.index<expectedImages)?'SUCCEEDED':'PARTIAL_SUCCEEDED', artifacts: images.map(image => ({ id: `image-${image.index}`, jobId, kind: 'image', uri: `asset://${image.hash}`, mime: 'image/png', metadata: { ...(handle.operation==='upscale'?{}:{seed:image.seed}), sha256: image.hash, ...(image.width && image.height ? {width:image.width,height:image.height} : {}) } })) };
    },
  };
}
