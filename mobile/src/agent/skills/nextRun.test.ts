import {createInitializedRealSqliteTestDb} from '../../test/realSqlite';
import {selectNextRunSkills,acceptNextRunSkills} from './nextRun';
import {createSkillStore} from './store';
import {validateSkillPackage} from './package';
import {withWriteTransaction} from '../../storage/sqliteBusy';
test('single-run override is consumed atomically, retried from snapshot and rejects scope drift',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
 const store=createSkillStore(db as never);const id=await store.install(validateSkillPackage({'SKILL.md':'---\nname: once\ndescription: once\n---\nReview'}));
 await selectNextRunSkills(db as never,'t',[id]);
 await expect(withWriteTransaction(db as never,async tx=>{await acceptNextRunSkills(tx,'t','r');throw Error('rollback');})).rejects.toThrow('rollback');
 expect(db.getAllSync('SELECT * FROM agent_skill_next_runs')).toHaveLength(1);
 await withWriteTransaction(db as never,tx=>acceptNextRunSkills(tx,'t','r'));
 expect((await store.capture('t','r')).versions[0].id).toBe(id);expect((await store.capture('t','other')).versions).toEqual([]);
 expect(db.getAllSync('SELECT * FROM agent_skill_next_runs')).toEqual([]);
 await withWriteTransaction(db as never,tx=>acceptNextRunSkills(tx,'t','retry','r'));expect(await store.capture('t','retry')).toEqual(await store.capture('t','r'));
 await selectNextRunSkills(db as never,'t',[id]);db.runSync("UPDATE creative_execution_state SET epoch='changed'");
 await expect(withWriteTransaction(db as never,tx=>acceptNextRunSkills(tx,'t','bad'))).rejects.toThrow('范围已变化');
 }finally{db.close();}
});
