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

test('keyset pages keep equal timestamps disjoint and search covers project context',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
  db.execSync('PRAGMA foreign_keys=OFF');
  db.runSync("INSERT INTO creative_projects VALUES('p','Unique project','',0,NULL,1,1)");
  for(let i=0;i<100;i++)db.runSync(`INSERT INTO creative_generation_drafts
    (id,project_id,provider_id,workflow_id,input_json,state,created_at,updated_at)
    VALUES(?,?,'novelai','image','{"prompt":"portrait"}','EDITING',1,10)`,`d${String(i).padStart(3,'0')}`,i===0?'p':null);
  const first=await readCreationRecords(db as never,{limit:30});
  const last=first[first.length-1].draft;
  const next=await readCreationRecords(db as never,{limit:30,after:{updatedAt:last.updated_at!,id:last.id}});
  expect(first).toHaveLength(30);expect(next).toHaveLength(30);
  expect(new Set([...first,...next].map(row=>row.draft.id)).size).toBe(60);
  const found=await readCreationRecords(db as never,{query:'Unique project'});
  expect(found.map(r=>r.draft.id)).toEqual(['d000']);
  expect(await readCreationRecords(db as never,{mode:'video'})).toEqual([]);
 }finally{db.close();}
});

import {readCreationRecordPage} from './creationRecords';
test('a changed session invalidates an old cursor instead of silently losing a moved row',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
  for(let i=0;i<35;i++)db.runSync(`INSERT INTO creative_generation_drafts
    (id,provider_id,workflow_id,input_json,state,revision,created_at,updated_at)
    VALUES(?,'novelai','image','{"prompt":"portrait"}','EDITING',0,1,?)`,`draft-${i}`,i);
  const first=await readCreationRecordPage(db as never);
  expect(first.items).toHaveLength(30);expect(first.next).toBeDefined();
  db.runSync("UPDATE creative_generation_drafts SET revision=revision+1,updated_at=99 WHERE id='draft-0'");
  const changed=await readCreationRecordPage(db as never,{after:first.next});
  expect(changed.reset).toBe(true);expect(changed.items[0].draft.id).toBe('draft-0');
  const next=await readCreationRecordPage(db as never,{after:changed.next});
  expect(next.reset).toBe(false);expect(next.items).toHaveLength(5);
 }finally{db.close();}
});

test('video workbench values are eligible and damaged session IDs never merge unrelated drafts',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
  for(const id of ['video-a','video-b'])db.runSync(`INSERT INTO creative_generation_drafts
    (id,provider_id,workflow_id,input_json,state,created_at,updated_at)
    VALUES(?,'autodl','video',?,'EDITING',1,1)`,id,JSON.stringify({schemaVersion:2,values:{prompt:'Camera moves'}}));
  const rows=await readCreationRecords(db as never,{mode:'video',query:'Camera moves'});
  expect(rows.map(row=>row.draft.id)).toEqual(['video-b','video-a']);
  expect(require('./workPresentation').draftPresentation(rows[0].draft).title).toBe('Camera moves');
 }finally{db.close();}
});
