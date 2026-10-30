import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';

test('concurrent imports under different names and projects share one original, restore missing media and keep user metadata',async()=>{
 const db=createInitializedRealSqliteTestDb(),service=createCreativeService(db as never);let n=0;
 const exec=async(command:Parameters<typeof service.execute>[0])=>{const result=await service.execute(command,`k${n++}`);if(result.status!=='completed')throw Error('expected');return result.value;};
 try{
  const hash='d'.repeat(64);db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'audio/mpeg',`cas/sha256/dd/${hash}`);
  const p1=await exec({name:'project.create',payload:{title:'one'}}),p2=await exec({name:'project.create',payload:{title:'two'}});
  const [a,b]=await Promise.all([p1,p2].map((p,i)=>exec({name:'asset.import',payload:{title:`audio-${i}.mp3`,kind:'audio',blobSha256:hash,projectId:p.projectId,sourceUri:`content://picked/${i}`}})));
  expect(a).toEqual(b);expect(await service.assets()).toHaveLength(1);
  expect(db.getAllSync('SELECT * FROM creative_assets')).toHaveLength(1);
  expect(db.getAllSync('SELECT * FROM creative_project_assets')).toHaveLength(2);
  expect(db.getAllSync('SELECT * FROM artifact_blobs')).toHaveLength(1);
  await exec({name:'asset.describe',payload:{id:a.assetId,expectedRevision:0,title:'My sound',description:'Keep',tags:['music']}});
  db.runSync("UPDATE creative_file_resources SET state='MISSING',blob_sha256=NULL WHERE version_id=?",a.versionId);
  const again=await exec({name:'asset.import',payload:{title:'renamed.mp3',kind:'audio',blobSha256:hash,projectId:p1.projectId}});
  expect(again).toEqual(a);expect((await service.asset(a.assetId))?.title).toBe('My sound');
  expect((await service.versions(a.assetId))[0].state).toBe('AVAILABLE');
  expect(db.getAllSync('SELECT * FROM creative_project_assets')).toHaveLength(2);
  expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
 }finally{db.close();}
});

test('historical duplicate imports collapse before pagination without rewriting immutable references; trash is a group operation',async()=>{
 const db=createInitializedRealSqliteTestDb(),service=createCreativeService(db as never);const hash='e'.repeat(64);
 try{
  db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'audio/mpeg',`cas/sha256/ee/${hash}`);
  for(const id of ['old-a','old-b']){
   db.runSync("INSERT INTO creative_assets VALUES(?,'audio',?,?,0,1,1)",id,id,id+'-v');
   db.runSync("INSERT INTO creative_asset_versions VALUES(?,?,1,'import','{}',1)",id+'-v',id);
   db.runSync("INSERT INTO creative_version_files VALUES(?,'original',?,'AVAILABLE')",id+'-v',hash);
  }
  expect((await service.assets()).map(a=>a.id)).toEqual(['old-a']);
  const page=await service.availableVersionPage({kind:'audio',limit:1});expect(page.items).toHaveLength(1);expect(page.next).toBeUndefined();
  expect((await service.versionsByIds(['old-b-v']))[0].assetId).toBe('old-b');
  db.runSync("INSERT INTO creative_projects VALUES('p','P','',0,NULL,1,1)");
  db.runSync("INSERT INTO creative_project_assets VALUES('p','old-b','old-b-v',0)");
  expect((await service.assets({projectId:'p'}))[0].id).toBe('old-b');
  await expect(service.execute({name:'asset.trash',payload:{id:'old-a',expectedRevision:0}},'trash')).rejects.toThrow('引用');
  expect(db.getAllSync('SELECT * FROM creative_asset_trash')).toEqual([]);
  db.runSync('DELETE FROM creative_project_assets');
  await service.execute({name:'asset.trash',payload:{id:'old-a',expectedRevision:0}},'trash-ok');
  expect(await service.assets()).toEqual([]);expect(await service.assets({trash:true})).toHaveLength(1);
  await service.execute({name:'asset.restore',payload:{id:'old-a',expectedRevision:1}},'restore');
  expect(await service.assets()).toHaveLength(1);
  expect(db.getAllSync('SELECT * FROM creative_asset_versions')).toHaveLength(2);
  expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
 }finally{db.close();}
});


test('asset cursors traverse beyond 1000 records without duplicates after a head insertion',async()=>{
 const db=createInitializedRealSqliteTestDb(),service=createCreativeService(db as never);
 try{
  for(let i=0;i<1011;i++)db.runSync("INSERT INTO creative_assets VALUES(?,'image',?,NULL,0,0,?)",'a'+String(i).padStart(4,'0'),'item '+i,Math.floor(i/3));
  let rows=await service.assets({limit:40}),all=rows.map(a=>a.id);
  db.runSync("INSERT INTO creative_assets VALUES('new','image','new',NULL,0,0,9999)");
  while(rows.length===40){const last=rows[rows.length-1];rows=await service.assets({limit:40,after:{updatedAt:last.updatedAt,id:last.id}});all.push(...rows.map(a=>a.id));}
  expect(all).toHaveLength(1011);expect(new Set(all).size).toBe(1011);expect(all).not.toContain('new');
 }finally{db.close();}
});
