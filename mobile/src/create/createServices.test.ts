import { createInitializedRealSqliteTestDb } from '../test/realSqlite';
import { defaultSubmissionDependencies } from './createServices';
import { builtinWorkflowDefinitions } from '../workflows/registry/builtin';
import type { RegistryRecord } from '../workflows/registry/types';
import type { ResolvedCredential } from '../providers/credentials';

let mockDb:ReturnType<typeof createInitializedRealSqliteTestDb>;
let mockCredential:ResolvedCredential|null;
const mockResolve=jest.fn(async()=>mockCredential);
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('../creative/accountRuntime',()=>({defaultAutodlCredential:()=>mockResolve()}));
jest.mock('../media/inputReader',()=>({createInputReader:()=>async()=>{throw new Error('source missing');}}));

const definition=builtinWorkflowDefinitions[1];
const input={definition,activeRecord:{workflowId:definition.id,version:definition.version,contentHash:'hash'} as RegistryRecord,inputSnapshot:{prompt:'pan',resolution:'480p竖',duration:5,seed:1,images:[],audios:[]},images:[],audios:[],foregroundTick:jest.fn()};

beforeEach(()=>{mockDb=createInitializedRealSqliteTestDb();mockResolve.mockClear();mockCredential={accountId:'original',generationId:'g1',provider:'autodl',token:'original-secret'};});
afterEach(()=>mockDb.close());

test('the compatibility form reads readiness only and submission pins the current account once without serializing its secret',async()=>{
  expect(await defaultSubmissionDependencies.readAccountReady()).toBe(true);
  mockCredential={accountId:'next',generationId:'g2',provider:'autodl',token:'next-secret'};
  mockResolve.mockClear();
  const task=await defaultSubmissionDependencies.queue(input);
  expect(mockResolve).toHaveBeenCalledTimes(1);
  const payload=mockDb.getFirstSync<{payload_json:string}>('SELECT payload_json FROM workflow_operations WHERE job_id=?',task.id)!.payload_json;
  expect(JSON.parse(payload).credentialBinding).toEqual({accountId:'next',generationId:'g2',provider:'autodl'});
  expect(payload).not.toContain('secret');
});

test('missing credentials or unavailable reference files fail before creating a placeholder job',async()=>{
  mockCredential=null;
  expect(await defaultSubmissionDependencies.readAccountReady()).toBe(false);
  await expect(defaultSubmissionDependencies.queue(input)).rejects.toThrow('连接 AutoDL');
  mockCredential={accountId:'a',generationId:'g',provider:'autodl',token:'test-secret'};
  await expect(defaultSubmissionDependencies.queue({...input,inputSnapshot:{...input.inputSnapshot,images:[{uri:'asset://'+'a'.repeat(64),mime:'image/png',name:'source.png'}]}})).rejects.toThrow('source missing');
  expect(mockDb.getFirstSync('SELECT COUNT(*) AS n FROM workflow_jobs')).toEqual({n:0});
  expect(mockDb.getFirstSync('SELECT COUNT(*) AS n FROM workflow_operations')).toEqual({n:0});
});
