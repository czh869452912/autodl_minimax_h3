import type {AppDatabase} from '../../storage/appDatabase';
import {withWriteTransaction} from '../../storage/sqliteBusy';
import {createSkillStore} from './store';
export async function selectNextRunSkills(db:AppDatabase,threadId:string,ids:string[]|null){
 await withWriteTransaction(db,async tx=>{
  if(ids===null){await tx.runAsync('DELETE FROM agent_skill_next_runs WHERE thread_id=?',threadId);return;}
  if(ids.length>8||new Set(ids).size!==ids.length)throw new Error('单次最多选择 8 个不同技能');
  const scope=await tx.getFirstAsync<{project_id:string|null;revision:number}>('SELECT * FROM creative_agent_scopes WHERE thread_id=?',threadId);
  const epoch=(await tx.getFirstAsync<{epoch:string}>('SELECT epoch FROM creative_execution_state WHERE id=1'))!.epoch;
  const versions=await createSkillStore(tx).list();const selected=ids.map(id=>{const row=versions.find(v=>v.id===id);if(!row)throw new Error('技能版本缺失');return row;});
  if(new Set(selected.map(v=>v.name)).size!==selected.length)throw new Error('同名技能只能选择一个版本');
  await tx.runAsync('INSERT INTO agent_skill_next_runs VALUES(?,?,?,?,?) ON CONFLICT(thread_id) DO UPDATE SET project_id=excluded.project_id,scope_revision=excluded.scope_revision,execution_epoch=excluded.execution_epoch,versions_json=excluded.versions_json',threadId,scope?.project_id??null,scope?.revision??0,epoch,JSON.stringify(selected.map(v=>({id:v.id,revocation:v.revocation}))));
 });
}
/** Runs in the message acceptance transaction: no gap between selection consumption and run creation. */
export async function acceptNextRunSkills(tx:AppDatabase,threadId:string,runId:string,retryOf?:string){
 if(retryOf){const old=await tx.getFirstAsync<{snapshot_json:string}>('SELECT snapshot_json FROM agent_skill_runs WHERE thread_id=? AND run_id=?',threadId,retryOf);if(old){await tx.runAsync('INSERT INTO agent_skill_runs VALUES(?,?,?,?)',threadId,runId,old.snapshot_json,Date.now());return;}}
 const pending=await tx.getFirstAsync<{project_id:string|null;scope_revision:number;execution_epoch:string;versions_json:string}>('SELECT * FROM agent_skill_next_runs WHERE thread_id=?',threadId);if(!pending)return;
 const scope=await tx.getFirstAsync<{project_id:string|null;revision:number}>('SELECT * FROM creative_agent_scopes WHERE thread_id=?',threadId);
 const epoch=(await tx.getFirstAsync<{epoch:string}>('SELECT epoch FROM creative_execution_state WHERE id=1'))!.epoch;
 if(pending.execution_epoch!==epoch||pending.project_id!==(scope?.project_id??null)||pending.scope_revision!==(scope?.revision??0))throw new Error('单次技能范围已变化，请重新选择');
 const snapshot={epoch,versions:JSON.parse(pending.versions_json)};await createSkillStore(tx).resolve(snapshot);
 await tx.runAsync('INSERT INTO agent_skill_runs VALUES(?,?,?,?)',threadId,runId,JSON.stringify(snapshot),Date.now());
 await tx.runAsync('DELETE FROM agent_skill_next_runs WHERE thread_id=?',threadId);
}
