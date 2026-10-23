import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
test('trash rejects referenced assets, retains files and restores with optimistic revisions',async()=>{
  const db=createInitializedRealSqliteTestDb();const service=createCreativeService(db as never);let n=0;
  const execute=async(command:Parameters<typeof service.execute>[0])=>{const r=await service.execute(command,`key${++n}`);if(r.status!=='completed')throw new Error('expected');return r.value;};
  try{
    const hash='a'.repeat(64);db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'image/png',`cas/${hash}`);
    const {projectId}=await execute({name:'project.create',payload:{title:'Project'}});
    const {assetId,versionId}=await execute({name:'asset.import',payload:{title:'Reference',kind:'image',blobSha256:hash,projectId}});
    await expect(execute({name:'asset.trash',payload:{id:assetId,expectedRevision:0}})).rejects.toThrow('引用');
    await execute({name:'asset.unlinkFromProject',payload:{assetId,projectId,expectedRevision:0}});
    await execute({name:'asset.describe',payload:{id:assetId,expectedRevision:0,title:'Observatory',description:'Starry sky',tags:['night','night']}});
    expect(await service.assets({query:'night'})).toHaveLength(1);
    await execute({name:'asset.trash',payload:{id:assetId,expectedRevision:1}});
    expect(await service.assets()).toHaveLength(0);expect(await service.assets({trash:true})).toHaveLength(1);
    expect(db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(1);
    await expect(execute({name:'asset.restore',payload:{id:assetId,expectedRevision:1}})).rejects.toThrow('REVISION_CONFLICT');
    await execute({name:'asset.restore',payload:{id:assetId,expectedRevision:2}});
    expect((await service.versions(assetId))[0].id).toBe(versionId);
    expect((await service.assets())[0].currentVersionId).toBe(versionId);
  }finally{db.close();}
});
