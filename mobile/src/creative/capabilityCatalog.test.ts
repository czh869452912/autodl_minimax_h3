import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {readCapabilityCatalog} from './capabilityCatalog';
import {createWorkflowRegistry} from '../workflows/registry/repository';
test('catalog exposes installed declarations, missing adapters and account gaps without execution',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
 const registry=createWorkflowRegistry(db as never);
 await registry.upsert({workflowId:'demo',version:'1',contentHash:'hash',hashScheme:'workflow-definition/sorted-json@1',source:'remote',trust:'trusted',installedAt:1,definitionJson:JSON.stringify({platform:{adapter:'missing',operation:'generate'},metadata:{title:'Demo'},inputs:{prompt:{type:'string'}},outputs:{artifacts:[{kind:'video'}]}})});
 await registry.setActive('demo','1','hash');
 const page=await readCapabilityCatalog(db as never,'',1);expect(page.items[0]).toMatchObject({id:'demo',reasons:['ADAPTER_UNAVAILABLE','ACCOUNT_NOT_BOUND'],executionAllowed:false});
 const next=await readCapabilityCatalog(db as never,page.next);expect(next.items[0].id).toBe('novelai-image-basic');expect(next.items[0].models.length).toBeGreaterThan(0);
 for(const table of ['workflow_jobs','creative_authorizations','creative_budget_reservations'])expect(db.getAllSync('SELECT * FROM '+table)).toEqual([]);
 expect(JSON.stringify(page)).not.toContain('token');
 }finally{db.close();}
});
