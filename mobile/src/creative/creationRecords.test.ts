import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {readCreationRecords} from './creationRecords';

test('counts all submissions beyond the recent draft limit and retains older sessions',async()=>{
  const db=createInitializedRealSqliteTestDb();
  try {
    db.execSync('PRAGMA foreign_keys=OFF');
    for(let i=0;i<215;i++) db.runSync(`INSERT INTO creative_generation_drafts
      (id,target_asset_id,provider_id,workflow_id,input_json,state,job_id,created_at,updated_at)
      VALUES(?,?,'novelai','image','{"prompt":"portrait"}',?,?,?,?)`,
      `draft-${i}`,i===0?'old':'active',i===214?'EDITING':'SUBMITTED',i===214?null:`job-${i}`,i,i);
    const rows=await readCreationRecords(db as never);
    expect(rows.map(r=>[r.draft.id,r.generations])).toEqual([['draft-214',213],['draft-0',1]]);
  }finally{db.close();}
});
