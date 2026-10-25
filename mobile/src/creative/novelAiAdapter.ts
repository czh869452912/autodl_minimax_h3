import CryptoJS from 'crypto-js';
import type { ProviderAdapter } from '../workflows/providers/registry';
import {isNovelAiUpscaleRequest,upscaleExpectedSize} from './novelAiUpscale';
import {ProviderError,ProviderPreflightError} from '../workflows/providers/errors';
import type {PlatformAdapterManifest} from '../workflows/schema/types';
export const novelAiManifest:PlatformAdapterManifest={ id: 'novelai-image', adapterVersion: '1', platforms: ['novelai'], capabilities: ['image.generate'], credentialKinds: ['novelai-token'], operations: ['image.generate'], supportedArtifactKinds: ['image'] };
export type NovelAiResponseStore = {
  assertReady?(upscale:boolean):void;
  generate(key: string, request: string, hash: string, token: string): Promise<string>;
  upscale?(key: string, request: string, hash: string, token: string): Promise<string>;
  lookup(key: string, hash: string): Promise<string | null>;
  importResponse(uri: string, key: string, upscale?:boolean): Promise<Array<{ hash: string; seed?: number; index: number; width?: number; height?: number }>>;
};
export const novelAiKey = (jobId: string) => CryptoJS.SHA256(`novelai:${jobId}`).toString();
export const novelAiBodyHash = (body: Record<string, unknown>) => CryptoJS.SHA256(JSON.stringify(body)).toString();
export function createNovelAiAdapter(jobId: string, token: string, store: NovelAiResponseStore): ProviderAdapter {
  const key = novelAiKey(jobId);
  const inspect=(body:Record<string,unknown>)=>{
    try{
      const upscale=isNovelAiUpscaleRequest(body),outputSize=upscale?upscaleExpectedSize(body):undefined;
      const expectedImages=(body.parameters as {n_samples?:number}|undefined)?.n_samples??1;
      if(!Number.isInteger(expectedImages) || expectedImages<1 || expectedImages>4)throw new Error('NOVELAI_SAMPLE_COUNT_INVALID');
      if(upscale && !store.upscale)throw new Error('请安装支持超分的新版 Android 应用');
      store.assertReady?.(upscale);
      return {upscale,outputSize,expectedImages};
    }catch(error){throw new ProviderPreflightError('NOVELAI_INPUT_UNAVAILABLE',error instanceof Error?error.message:'图片生成条件尚未就绪');}
  };
  return {
    manifest: () => novelAiManifest,
    validateCredentials: async () => ({ ok: Boolean(token) }),
    async prepareInput(body,target){
      if(target?.operation && target.operation!=='image.generate')throw new ProviderPreflightError('LOCAL_OPERATION_INVALID','不支持的 NovelAI 操作');
      inspect(body);return body;
    },
    async submit(body) {
      const {upscale,outputSize,expectedImages}=inspect(body);
      const hash = novelAiBodyHash(body);
      try{
        if(upscale){await store.upscale!(key,JSON.stringify(body),hash,token);}
        else await store.generate(key, JSON.stringify(body), hash, token);
      }catch(cause){
        const code=cause && typeof cause==='object' && 'code' in cause?cause.code:undefined;
        // Only native, explicit rejection codes prove a failed request; timeouts and upstream failures remain uncertain.
        if(typeof code==='string' && /^NOVELAI_HTTP_(400|401|402|403|404|422|429)$/.test(code)){
          const status=Number(code.slice(-3));throw new ProviderError('novelai','submit',status===401||status===403?'auth':'http','NovelAI 拒绝请求',status);
        }
        throw cause;
      }
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
