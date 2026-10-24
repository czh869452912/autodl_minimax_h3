import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {persistSubmissionCommand} from '../create/submissionCommand';
import {createWorkflowRuntime} from '../workflows/runtime/runtime';
import {createBuiltinProviderAdapters} from '../workflows/providers/registry';
import definition from '../workflows/definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json';
import type {WorkflowDefinition} from '../workflows/schema/types';
import {executorRunner} from './executorRuntime';
let mockDb:ReturnType<typeof createInitializedRealSqliteTestDb>;
const original={accountId:'account-original',generationId:'generation-original',provider:'autodl',token:'original-test-secret'};
const mockResolve=jest.fn(),mockTransport=jest.fn();
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('../settings/storage',()=>({readSettings:async()=>({token:'',autoExportToGallery:false,keepPrivateCopy:true})}));
jest.mock('../creative/accountRuntime',()=>({creativeAccounts:()=>({resolveExact:(...args:unknown[])=>mockResolve(...args)}),defaultAutodlCredential:async()=>({...original,token:'different-default-secret'})}));
jest.mock('../providers/httpTransport',()=>({getNativeHttpTransport:()=>mockTransport}));
jest.mock('../storage/pendingMaintenance',()=>({readPendingMaintenance:async()=>undefined}));
jest.mock('../creative/runtime',()=>({migrateCreativeHistory:async()=>undefined}));
beforeEach(()=>{
  mockDb=createInitializedRealSqliteTestDb();mockResolve.mockReset().mockResolvedValue(original);mockTransport.mockReset().mockImplementation(async(_url:RequestInfo|URL,init?:RequestInit)=>new Response(JSON.stringify({code:'Success',data:init?.method==='POST'?{task_id:'remote'}:{status:'RUNNING',results:[]}}),{status:200}));
});
afterEach(()=>mockDb.close());
async function enqueue(){
  const adapters=createBuiltinProviderAdapters({resolveCredential:()=>original.token,transport:mockTransport});
  const provenance={workflowId:definition.id,workflowVersion:definition.version,contentHash:'hash'};
  const prepared=createWorkflowRuntime({adapters}).prepareSubmission(definition as WorkflowDefinition,{...provenance,inputs:{prompt:'pan',resolution:'768p竖',duration:5},source:'user',status:'ready'},provenance);
  const {accountId,generationId,provider}=original;
  return persistSubmissionCommand(mockDb as never,'runtime',prepared,{images:[],audios:[],credentialBinding:{accountId,generationId,provider}});
}
test('real application executor dispatches and polls compatibility-entry jobs with the pinned secret instead of current default',async()=>{
  const task=await enqueue();await executorRunner.runSlice({trigger:'service'});
  expect(mockTransport).toHaveBeenCalled();expect(mockTransport.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
  expect(mockResolve).toHaveBeenCalledWith('generation-original','dispatch');
  mockDb.runSync("UPDATE workflow_operations SET next_retry_at=0 WHERE job_id=? AND kind='STATUS_SYNC' AND state='PENDING'",task.id);
  await executorRunner.runSlice({trigger:'background'});
  expect(mockResolve).toHaveBeenCalledWith('generation-original','query');
  for(const [,init] of mockTransport.mock.calls)expect(init.headers.Authorization).toBe('original-test-secret');
  expect(mockDb.getFirstSync('SELECT status FROM workflow_jobs WHERE id=?',task.id)).toEqual({status:'RUNNING'});
  expect(mockTransport.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
});
test('a revoked pinned secret fails an unsent compatibility-entry job without creating UNKNOWN or sending HTTP',async()=>{
  const task=await enqueue();mockResolve.mockRejectedValue(new Error('CREDENTIAL_INACTIVE'));
  await executorRunner.runSlice({trigger:'service'});
  expect(mockTransport).not.toHaveBeenCalled();expect(mockDb.getFirstSync('SELECT status FROM workflow_jobs WHERE id=?',task.id)).toEqual({status:'FAILED'});
  expect(mockDb.getFirstSync("SELECT state FROM workflow_operations WHERE job_id=? AND kind='SUBMIT'",task.id)).toEqual({state:'FAILED'});
});
