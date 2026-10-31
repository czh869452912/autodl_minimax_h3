import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {pinRunRuntime,assertRunAuthority} from './runSpecification';
test('runtime contract pins configuration without secrets and rejects changed tools or model',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
  const config={apiKey:'private-api-key',endpoint:'https://private-endpoint.test/v1?token=secret',model:'model-a',timeoutMs:1000,maxRetries:0};
  await pinRunRuntime(db as never,'t','r',config,'skills',['read','propose']);
  await pinRunRuntime(db as never,'t','r',config,'skills',['propose','read']);
  const stored=db.getFirstSync<{snapshot_json:string}>('SELECT snapshot_json FROM creative_run_runtime_specs')!.snapshot_json;
  expect(stored).not.toContain('private');expect(stored).not.toContain('secret');
  await expect(pinRunRuntime(db as never,'t','r',{...config,model:'model-b'},'skills',['read','propose'])).rejects.toThrow('RUN_RUNTIME_CHANGED');
  await expect(pinRunRuntime(db as never,'t','r',config,'skills',['read','propose','adopt'])).rejects.toThrow('RUN_RUNTIME_CHANGED');
  db.runSync("INSERT INTO creative_run_specs VALUES('t','r',NULL,0,'old-epoch','user-adoption-v1')");
  await expect(assertRunAuthority(db as never,'t','r')).rejects.toThrow('RUN_AUTHORITY_CHANGED');
 }finally{db.close();}
});
