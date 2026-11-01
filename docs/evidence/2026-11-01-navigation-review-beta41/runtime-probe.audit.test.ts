import {createPromptRuntimeRegistry} from './runtimeStore';
import type {LocalThreadSnapshot,LocalThreadStore} from './threadStore';
const snapshot:LocalThreadSnapshot={threadId:'offline-thread',messages:[],state:{},createdAt:1,updatedAt:1};
const store={save:async()=>{}} as unknown as LocalThreadStore;
function agent(){return {threadId:'',messages:[],state:{},isRunning:false,abortRun:jest.fn(),dispose:jest.fn(),subscribe:()=>({unsubscribe:jest.fn()}),setMessages:jest.fn(),setState:jest.fn()};}
test('audit: changing explicit connection identity and image capability reuses the old configured runtime',async()=>{
 const factory=jest.fn(()=>agent() as never),registry=createPromptRuntimeRegistry(factory);
 const base={apiKey:'offline-only',endpoint:'https://example.com/v1',model:'test',timeoutMs:60000,maxRetries:0};
 try{
  const first=registry.ensure({...base,connectionId:'A',connectionRevision:1,supportsImages:true},snapshot,store);
  await first.flush();
  const next=registry.ensure({...base,connectionId:'B',connectionRevision:1,supportsImages:false},snapshot,store);
  expect(next).toBe(first);expect(factory).toHaveBeenCalledTimes(1);
  expect(factory).toHaveBeenLastCalledWith(expect.objectContaining({connectionId:'A',supportsImages:true}));
 }finally{await registry.disposeAll();}
});
