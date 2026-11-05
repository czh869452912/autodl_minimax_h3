import React from 'react';
import {act,create} from 'react-test-renderer';
import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {createCreativeAccounts} from './accounts';
import {createCreativeBudget} from './budget';
import {ProjectPermissions} from './ProjectPermissions';
import {readProjectAuthorizations,revokeReviewedProjectAuthorizations} from './projectPermissionStore';
import {ListAction} from '../ui/ListPageUI';
let mockDb:ReturnType<typeof createInitializedRealSqliteTestDb>;
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()})}));
jest.mock('../ui/icons',()=>({AppIcon:()=>null}));
let tree:ReturnType<typeof create>|undefined;
beforeEach(()=>{mockDb=createInitializedRealSqliteTestDb();});
afterEach(()=>{if(tree)act(()=>tree!.unmount());tree=undefined;mockDb.close();});
async function fixture(){
 const service=createCreativeService(mockDb as never),secrets=new Map<string,string>();
 const accounts=createCreativeAccounts(mockDb as never,{now:Date.now,verify:async()=>({namespace:'novelai',principalId:'test'}),secrets:{get:async key=>secrets.get(key)??null,set:async(k,v)=>{secrets.set(k,v);},remove:async key=>{secrets.delete(key);}}});
 const account=await accounts.connect('novelai','test-key'),budget=createCreativeBudget(mockDb as never);
 const project=async(key:string)=>{const result=await service.execute({name:'project.create',payload:{title:key,brief:''}},key);if(result.status!=='completed')throw Error('project');return result.value.projectId;};
 const id=await project('target'),other=await project('other');
 const grant=(projectId:string)=>budget.grant({provider:'novelai',generationId:account.generationId,projectId,operations:['image.generate'],requestLimit:1,amountLimit:null,allowUnknownCost:true,maxUnknownRequests:1,expiresAt:Date.now()+60000});
 const first=await grant(id),foreign=await grant(other);
 return {id,other,first,foreign,grant};
}
const click=async(label:string)=>act(async()=>tree!.root.findAllByType(ListAction).find(n=>n.props.label===label)!.props.onPress());
test('review and cancellation write nothing; confirmation revokes only reviewed project grants',async()=>{
 const f=await fixture();await act(async()=>{tree=create(<ProjectPermissions projectId={f.id} title="灯塔" onClose={jest.fn()}/>);});
 await click('核对撤销本项目全部 1 项授权');await click('保留授权，取消撤销');expect(await readProjectAuthorizations(mockDb as never,f.id)).toHaveLength(1);
 await click('核对撤销本项目全部 1 项授权');await click('确认撤销上述全部授权');expect(await readProjectAuthorizations(mockDb as never,f.id)).toHaveLength(0);expect(await readProjectAuthorizations(mockDb as never,f.other)).toHaveLength(1);expect(JSON.stringify(tree!.toJSON())).toContain('已撤销 1 项');expect(mockDb.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(0);
});
test('changed grant membership or revision rejects all writes until reviewed again',async()=>{
 const f=await fixture(),reviewed=await readProjectAuthorizations(mockDb as never,f.id);await f.grant(f.id);
 await expect(revokeReviewedProjectAuthorizations(mockDb as never,f.id,reviewed)).rejects.toThrow('清单已变化');expect(await readProjectAuthorizations(mockDb as never,f.id)).toHaveLength(2);
 const fresh=await readProjectAuthorizations(mockDb as never,f.id);mockDb.runSync('UPDATE creative_authorizations SET revision=revision+1 WHERE id=?',f.first);
 await expect(revokeReviewedProjectAuthorizations(mockDb as never,f.id,fresh)).rejects.toThrow('清单已变化');expect(await readProjectAuthorizations(mockDb as never,f.id)).toHaveLength(2);
});
test('one failed write rolls back the entire reviewed revocation',async()=>{
 const f=await fixture();await f.grant(f.id);const rows=await readProjectAuthorizations(mockDb as never,f.id);
 mockDb.execSync(`CREATE TRIGGER fail_revoke BEFORE UPDATE ON creative_authorizations WHEN OLD.id='${rows[1].id}' BEGIN SELECT RAISE(ABORT,'injected'); END`);
 await expect(revokeReviewedProjectAuthorizations(mockDb as never,f.id,rows)).rejects.toThrow('injected');expect(await readProjectAuthorizations(mockDb as never,f.id)).toHaveLength(2);
});
