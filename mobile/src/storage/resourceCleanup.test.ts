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
