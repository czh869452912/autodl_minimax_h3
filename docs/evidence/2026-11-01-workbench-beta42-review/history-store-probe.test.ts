import {createInitializedRealSqliteTestDb} from '../../test/realSqlite';
import {createSkillStore} from './store';

test('review probe: twenty newer project B runs displace the project A run from the only history page',async()=>{
 const db=createInitializedRealSqliteTestDb(),clock=jest.spyOn(Date,'now').mockReturnValue(1);
 try{
  const store=createSkillStore(db as never);
  for(const p of ['A','B'])db.runSync('INSERT INTO creative_projects VALUES(?,?,?,0,NULL,1,1)',p,p,'');
  db.runSync("INSERT INTO creative_agent_scopes VALUES('thread-A','A',0,1)");
  db.runSync("INSERT INTO creative_agent_scopes VALUES('thread-B','B',0,1)");
  await store.capture('thread-A','run-A');
  for(let i=0;i<20;i++){
   clock.mockReturnValue(100+i);
   await store.capture('thread-B','run-B-'+i);
  }
  expect(db.getFirstSync<{n:number}>("SELECT count(*) AS n FROM agent_skill_runs WHERE thread_id='thread-A'")?.n).toBe(1);
  const page=await store.runs();
  expect(page).toHaveLength(20);
  expect(page.every(row=>row.threadId==='thread-B')).toBe(true);
  expect(page.some(row=>row.threadId==='thread-A')).toBe(false);
 }finally{clock.mockRestore();db.close();}
});
