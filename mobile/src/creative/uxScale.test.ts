import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {readCreationRecords} from './creationRecords';
import {readUsageGraph} from './usageGraph';

test.each([100,1000,10000])('bounded selection and summaries with %i versions',async count=>{
 const db=createInitializedRealSqliteTestDb();
 try{
  const hash='a'.repeat(64);
  db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'image/png','cas/image');
  db.runSync("INSERT INTO creative_assets VALUES('asset','image','Scale','v0',0,1,1)");
  db.execSync('BEGIN');
  for(let i=0;i<count;i++){
   db.runSync("INSERT INTO creative_asset_versions VALUES(?,?,?,'generated','{}',?)",`v${i}`,'asset',i+1,i);
   db.runSync("INSERT INTO creative_version_files VALUES(?,'original',?,'AVAILABLE')",`v${i}`,hash);
  }
  db.execSync('COMMIT');
  const service=createCreativeService(db as never),start=performance.now();
  const first=await service.availableVersionPage({kind:'image'});
  const elapsed=performance.now()-start;
  expect(first.items).toHaveLength(40);expect(first.next).toBeDefined();
  const second=await service.availableVersionPage({kind:'image',after:first.next});
  expect(second.items.some(v=>first.items.some(a=>a.version.id===v.version.id))).toBe(false);
  expect(await readUsageGraph(db as never,'asset')).toEqual([]);
  expect(await readCreationRecords(db as never)).toEqual([]);
  console.info(JSON.stringify({versions:count,selectionMs:Number(elapsed.toFixed(2)),returned:first.items.length,environment:'host SQLite; not Android frames/memory'}));
 }finally{db.close();}
});

test.each([100,1000,10000])('recent creation pages stay bounded with %i independent drafts',async count=>{
 const db=createInitializedRealSqliteTestDb();try{
  db.execSync('BEGIN');
  for(let i=0;i<count;i++)db.runSync(`INSERT INTO creative_generation_drafts
    (id,provider_id,workflow_id,input_json,state,revision,created_at,updated_at)
    VALUES(?,'autodl','video',?,'EDITING',0,1,?)`,`draft-${i}`,JSON.stringify({schemaVersion:2,sessionId:`session-${i}`,values:{prompt:'Camera '+i+' '.repeat(1000)}}),i);
  db.execSync('COMMIT');
  const readPage=require('./creationRecords').readCreationRecordPage;
  const start=performance.now(),first=await readPage(db),elapsed=performance.now()-start;
  const next=await readPage(db,{after:first.next});
  expect(first.items).toHaveLength(30);expect(next.items).toHaveLength(30);
  expect(new Set([...first.items,...next.items].map((row:any)=>row.draft.id)).size).toBe(60);
  console.info(JSON.stringify({drafts:count,firstPageMs:Number(elapsed.toFixed(2)),returned:first.items.length,environment:'host SQLite; not Android frames/memory'}));
 }finally{db.close();}
});
