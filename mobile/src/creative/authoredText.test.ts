import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
test('authored text preserves immutable history and selected version when a new revision is saved',async()=>{
  const db=createInitializedRealSqliteTestDb();try{
    const service=createCreativeService(db as never),hash='a'.repeat(64),other='b'.repeat(64);
    for(const h of [hash,other])db.runSync('INSERT INTO artifact_blobs VALUES(?,20,?,?,1,1)',h,'text/plain',`cas/${h}`);
    const first=await service.execute({name:'asset.authorText',payload:{title:'角色设定',kind:'prompt',blobSha256:hash}},'first');
    if(first.status!=='completed')throw new Error('expected');
    const command={name:'asset.authorText' as const,payload:{title:'角色设定',kind:'prompt' as const,blobSha256:other,assetId:first.value.assetId,expectedRevision:0}};
    const second=await service.execute(command,'second');expect(await service.execute(command,'second')).toEqual(second);
    await expect(service.execute(command,'stale')).rejects.toThrow('REVISION_CONFLICT');
    expect((await service.assets())[0].currentVersionId).toBe(first.value.versionId);
    expect((await service.versions(first.value.assetId)).map(v=>v.blobSha256)).toEqual([other,hash]);
    expect(db.getAllSync("SELECT * FROM artifact_blob_refs WHERE owner_type='creative_version'")).toHaveLength(2);
    expect(db.getAllSync('SELECT * FROM workflow_jobs')).toHaveLength(0);
    expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{db.close();}
});
