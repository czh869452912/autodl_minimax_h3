import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {cleanupCandidates,runResourceCleanup,safeCleanupPath,cleanupAge} from './resourceCleanup';
import CryptoJS from 'crypto-js';

test('cleanup protects registered originals, send markers, recent files and unknown paths',async()=>{
 const db=createInitializedRealSqliteTestDb();const sha='a'.repeat(64),key='b'.repeat(64),now=cleanupAge*3;
 const original=`cas/sha256/aa/${sha}`,orphan=`cas/sha256/bb/${key}`;
 try{
  db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,0,0)',sha,'image/png',original);
  const paths=[original,orphan,`creative-responses/${key}/sent`,`creative-responses/${key}/response.json`,'cas/parts/stale.part','cas/parts/recent.part','cache/creative-previews/thumb.jpg','../escape','creative-backups/backup.jpg'];
  const files={list:async()=>paths.map(path=>({path,size:10,modifiedAt:path.includes('recent')?now:1})),remove:jest.fn(async()=>{})};
  expect((await cleanupCandidates(db as never,files,now)).map(f=>f.path)).toEqual([orphan,`creative-responses/${key}/response.json`,'cas/parts/stale.part','cache/creative-previews/thumb.jpg']);
  files.remove.mockRejectedValueOnce(Error('locked'));
  expect(await runResourceCleanup(db as never,files,now)).toEqual({deleted:3,bytes:30,failed:1});
  expect(safeCleanupPath(`creative-responses/${key}/sent`)).toBe(false);
  db.runSync("INSERT INTO artifact_blob_refs VALUES(?,'legacy','kept',0)",key);
  expect((await cleanupCandidates(db as never,files,now)).some(f=>f.path===orphan)).toBe(false);
  db.runSync('DELETE FROM artifact_blob_refs WHERE blob_sha256=?',key);
  db.runSync("INSERT INTO workflow_artifacts(id,job_id,kind,uri) VALUES('legacy','old','image',?)",`file:///private/${orphan}`);
  expect((await cleanupCandidates(db as never,files,now)).some(f=>f.path===orphan)).toBe(false);
  db.runSync("INSERT INTO workflow_jobs(id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at) VALUES('kept','test','1','hash','novelai-image','1','{}','FAILED',0,0)");
  const receipt=`creative-responses/${CryptoJS.SHA256('novelai:kept')}/response.json`;
  const receiptFiles={list:async()=>[{path:receipt,size:10,modifiedAt:1}],remove:jest.fn(async()=>{})};
  expect(await cleanupCandidates(db as never,receiptFiles,now)).toEqual([]);
 }finally{db.close();}
});

test('pending operations prevent orphan and part cleanup while previews remain disposable',async()=>{
 const db=createInitializedRealSqliteTestDb();
 try{
  db.runSync("INSERT INTO workflow_operations(id,kind,idempotency_key,payload_json,state,next_retry_at,created_at,updated_at) VALUES('op','TEST','op','{}','PENDING',0,0,0)");
  const files={list:async()=>['cas/parts/old.part','cache/creative-previews/old.jpg'].map(path=>({path,size:5,modifiedAt:1})),remove:jest.fn(async()=>{})};
  expect((await cleanupCandidates(db as never,files,cleanupAge*3)).map(f=>f.path)).toEqual(['cache/creative-previews/old.jpg']);
 }finally{db.close();}
});
