import {createAgentRuntimeAdapter} from './agentRuntimeAdapter';
const command={id:'submission',runId:'run',draftRevision:1,message:{id:'user',role:'user' as const,content:'scene'}};
function fixture(){return {accept:jest.fn(async()=>({submissionId:'submission',userMessageId:'user',runId:'run'})),disposed:()=>false,needsReload:()=>false,subscribe:jest.fn(),getSnapshot:()=>({state:{}}),agent:{isRunning:false,abortRun:jest.fn(),dispose:jest.fn()}};}
test('durable acceptance precedes execution and duplicate UI requests share one execution',async()=>{
 const runtime=fixture(),execute=jest.fn(async()=>{});let release!:(receipt:any)=>void;
 runtime.accept.mockImplementationOnce(()=>new Promise(r=>{release=r;}));const adapter=createAgentRuntimeAdapter(runtime as any,execute);
 const a=adapter.start(command),b=adapter.start(command);expect(execute).not.toHaveBeenCalled();
 release({submissionId:'submission',userMessageId:'user',runId:'run'});const [first,second]=await Promise.all([a,b]);await first.completion;
 expect(first).toBe(second);expect(runtime.accept).toHaveBeenCalledTimes(1);expect(execute).toHaveBeenCalledTimes(1);
 adapter.cancel();expect(runtime.agent.abortRun).toHaveBeenCalledTimes(1);expect(runtime.agent.dispose).not.toHaveBeenCalled();
});
test('accepted but unreadable storage does not start the model; a failed write can be retried',async()=>{
 const runtime=fixture(),execute=jest.fn(async()=>{}),adapter=createAgentRuntimeAdapter(runtime as any,execute);
 runtime.accept.mockRejectedValueOnce(new Error('disk'));await expect(adapter.start(command)).rejects.toThrow('disk');
 runtime.accept.mockResolvedValueOnce({submissionId:'submission',userMessageId:'user',runId:'run',executionReady:false} as any);
 await (await adapter.start(command)).completion;expect(execute).not.toHaveBeenCalled();
});
test('interrupted recovery remains distinct from a resumable active run',()=>{
 const runtime=fixture();runtime.getSnapshot=()=>({state:{h3Runs:[{id:'r',userMessageId:'u',startedAt:1,status:'interrupted',messageIds:[],tools:[]}]}});
 const adapter=createAgentRuntimeAdapter(runtime as any);expect(adapter.recovery()).toBe('interrupted');runtime.agent.isRunning=true;expect(adapter.recovery()).toBe('running');
});
