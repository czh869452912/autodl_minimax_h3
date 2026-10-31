import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {timelineManifest,timelineSpec} from './timelines';
import {assertSemanticAssetRemovable} from './semanticDependencies';

test('timeline snapshots pin exact inputs, reject cross-project sources and release only on discard',async()=>{
 const db=createInitializedRealSqliteTestDb();let n=0;const service=createCreativeService(db as never,{id:()=>`t-${++n}`,now:()=>100});
 const command=async(name:any,payload:any)=>{const r=await service.execute({name,payload},`c-${++n}`);if(r.status!=='completed')throw new Error('expected completed');return r.value;};
 try{
  const {projectId}=await command('project.create',{title:'film'});const other=await command('project.create',{title:'other'});
  const hash='a'.repeat(64);db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'video/mp4',`cas/${hash}`);
  const {assetId,versionId}=await command('asset.import',{title:'clip',kind:'video',blobSha256:hash,projectId});
  const spec={schemaVersion:1,orientation:'portrait',clips:[{versionId,startMs:500,durationMs:2500,caption:'字幕'}],audio:null};
  await expect(command('timeline.create',{projectId:other.projectId,title:'bad',spec})).rejects.toThrow('TIMELINE_INPUT_UNAVAILABLE');
  const {timelineId}=await command('timeline.create',{projectId,title:'cut',spec});
  const manifest=await timelineManifest(db as never,timelineId,projectId);
  expect(manifest.spec).toEqual(spec);expect(manifest.inputs[0].blob_sha256).toBe(hash);
  await expect(timelineManifest(db as never,timelineId,other.projectId)).rejects.toThrow('TIMELINE_NOT_FOUND');
  expect(()=>db.runSync("UPDATE creative_timelines SET spec_json='{}'")).toThrow('TIMELINE_IMMUTABLE');
  await expect(assertSemanticAssetRemovable(db as never,assetId,projectId)).rejects.toThrow('时间线');
  await command('timeline.discard',{id:timelineId});
  await expect(assertSemanticAssetRemovable(db as never,assetId,projectId)).resolves.toBeUndefined();
  expect(db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_timeline'")).toEqual([]);
  expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
 }finally{db.close();}
});
test('timeline limits reject excessive duration, clips and invalid trims before writes',()=>{
 const clip={versionId:'v',startMs:0,durationMs:60001,caption:''};
 expect(()=>timelineSpec.parse({schemaVersion:1,orientation:'portrait',clips:[clip,clip],audio:null})).toThrow();
 expect(()=>timelineSpec.parse({schemaVersion:1,orientation:'portrait',clips:[{...clip,startMs:-1}],audio:null})).toThrow();
 expect(()=>timelineSpec.parse({schemaVersion:1,orientation:'portrait',clips:Array(21).fill({...clip,durationMs:250}),audio:null})).toThrow();
});
