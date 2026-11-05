import type {AppDatabase} from '../storage/appDatabase';
import {withWriteTransaction} from '../storage/sqliteBusy';

export type ProjectAuthorization={id:string;revision:number;provider_id:string;allowed_operations_json:string;request_limit:number;amount_limit:number|null;unit:string;allow_unknown_cost:number;expires_at:number};
// Include request-bound and currently unusable credentials: revocation must cover
// every unexpired grant for this project, not just today's default account.
export async function readProjectAuthorizations(db:AppDatabase,projectId:string,now=Date.now()){
 return db.getAllAsync<ProjectAuthorization>('SELECT id,revision,provider_id,allowed_operations_json,request_limit,amount_limit,unit,allow_unknown_cost,expires_at FROM creative_authorizations WHERE project_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY id',projectId,now);
}
export async function revokeReviewedProjectAuthorizations(db:AppDatabase,projectId:string,reviewed:ProjectAuthorization[],now=Date.now()){
 if(!reviewed.length)throw Error('没有待撤销授权');
 return withWriteTransaction(db,async tx=>{
  const current=await readProjectAuthorizations(tx,projectId,now);
  if(JSON.stringify(current.map(r=>[r.id,r.revision]))!==JSON.stringify(reviewed.map(r=>[r.id,r.revision])))throw Error('授权清单已变化，请重新读取并核对');
  for(const row of current)await tx.runAsync('UPDATE creative_authorizations SET revoked_at=?,revision=revision+1 WHERE id=? AND project_id=? AND revision=? AND revoked_at IS NULL',now,row.id,projectId,row.revision);
  return current.length;
 });
}
