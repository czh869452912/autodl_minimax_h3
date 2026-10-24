import { createNovelAiAdapter, type NovelAiResponseStore } from './novelAiAdapter';
import {ProviderPreflightError} from '../workflows/providers/errors';

test('one batch sends once and preserves independent artifact IDs, hashes and seeds',async()=>{
  const images=[0,1,2,3].map(index=>({index,hash:String(index).repeat(64),seed:123+index}));
  const store:NovelAiResponseStore={generate:jest.fn(async()=>'/response'),lookup:jest.fn(async()=>'/response'),importResponse:jest.fn(async()=>images)};
  const adapter=createNovelAiAdapter('job','private-token',store), handle=await adapter.submit({parameters:{n_samples:4}});
  const status=await adapter.getStatus(handle);
  expect(store.generate).toHaveBeenCalledTimes(1);expect(status.status).toBe('SUCCEEDED');
  expect(status.artifacts.map(a=>[a.id,a.metadata?.seed])).toEqual([['image-0',123],['image-1',124],['image-2',125],['image-3',126]]);
  expect(JSON.stringify(handle)).not.toContain('private-token');
});

test('a short batch remains usable as partial success without generating replacement images',async()=>{
  const store:NovelAiResponseStore={generate:jest.fn(async()=>'/response'),lookup:jest.fn(async()=>'/response'),importResponse:jest.fn(async()=>[{index:0,hash:'a'.repeat(64),seed:123}])};
  const adapter=createNovelAiAdapter('job','private-token',store), handle=await adapter.submit({parameters:{n_samples:2}});
  const status=await adapter.getStatus(handle);
  expect(status.status).toBe('PARTIAL_SUCCEEDED');expect(status.artifacts).toHaveLength(1);expect(store.generate).toHaveBeenCalledTimes(1);
});

test('invalid local image options fail in preflight before native generation',async()=>{
  const store:NovelAiResponseStore={generate:jest.fn(),lookup:jest.fn(),importResponse:jest.fn()};
  const adapter=createNovelAiAdapter('job','test-only',store);
  await expect(adapter.prepareInput!({parameters:{n_samples:5}})).rejects.toBeInstanceOf(ProviderPreflightError);
  expect(store.generate).not.toHaveBeenCalled();
});
