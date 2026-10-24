import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {persistSubmissionCommand} from '../create/submissionCommand';
import {createTaskCommandService} from './taskCommandService';
import {resolveTaskCredential} from './credentialBinding';
import {resolveCreativeQueryCredential} from '../creative/queryCredential';

test('compatibility-entry queue and queries retain the exact account, while a confirmed replacement binds the new account',async()=>{
  const db=createInitializedRealSqliteTestDb();
  try{
    const original={accountId:'account-1',generationId:'generation-1',provider:'autodl'},replacement={...original,accountId:'account-2',generationId:'generation-2'};
    const prepared={workflowId:'w',workflowVersion:'1',workflowContentHash:'h',adapterId:'autodl-comfyui',adapterVersion:'1',inputSnapshot:{prompt:'p'},requestInput:{prompt:'p'}} as never;
    const task=await persistSubmissionCommand(db as never,'bound',prepared,{images:[],audios:[],credentialBinding:original});
    const resolve=jest.fn(async()=>({...original,token:'test-secret'}));
    await expect(resolveTaskCredential(db as never,task.id,'dispatch',resolve)).resolves.toMatchObject(original);
    expect(resolve).toHaveBeenLastCalledWith('generation-1','dispatch');
    await expect(resolveCreativeQueryCredential(db as never,task.id,resolve)).resolves.toMatchObject(original);
    expect(resolve).toHaveBeenLastCalledWith('generation-1','query');
    await expect(resolveTaskCredential(db as never,task.id,'query',async()=>({...replacement,token:'wrong'}))).rejects.toThrow('IDENTITY_MISMATCH');
    resolve.mockRejectedValueOnce(new Error('CREDENTIAL_INACTIVE'));
    await expect(resolveCreativeQueryCredential(db as never,task.id,resolve)).rejects.toThrow('CREDENTIAL_INACTIVE');
    db.runSync("UPDATE workflow_jobs SET status='UNKNOWN' WHERE id=?",task.id);
    const commands=createTaskCommandService({db:db as never,fileExists:async()=>true,resolveCasUri:p=>p,prepareReplacement:async()=>replacement});
    const next=await commands.replaceUnknownAfterConfirmation(task.id);
    const newResolve=jest.fn(async()=>({...replacement,token:'new-secret'}));
    await expect(resolveTaskCredential(db as never,next,'dispatch',newResolve)).resolves.toMatchObject(replacement);
    expect(newResolve).toHaveBeenCalledWith('generation-2','dispatch');
    expect(JSON.stringify(db.getAllSync('SELECT payload_json FROM workflow_operations'))).not.toMatch(/test-secret|new-secret/);
    expect(await resolveTaskCredential(db as never,'historical-unbound','query',resolve)).toBeNull();
    expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{db.close();}
});

test('malformed binding fails closed instead of falling back to the default account',async()=>{
  const db=createInitializedRealSqliteTestDb();try{
    db.runSync("INSERT INTO workflow_operations(id,kind,job_id,idempotency_key,payload_json,state,next_retry_at,created_at,updated_at) VALUES('o','SUBMIT','j','key',?,'PENDING',1,1,1)",JSON.stringify({credentialBinding:{generationId:'g'}}));
    const resolve=jest.fn();await expect(resolveTaskCredential(db as never,'j','query',resolve)).rejects.toThrow('BINDING_INVALID');expect(resolve).not.toHaveBeenCalled();
  }finally{db.close();}
});
