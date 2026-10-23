import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
test('project cover pins an explicit image independently from asset default and project pin',async()=>{
  const db=createInitializedRealSqliteTestDb();try{
    const service=createCreativeService(db as never),p=await service.execute({name:'project.create',payload:{title:'film'}},'project');
    if(p.status!=='completed')throw new Error('expected');
    const hash='a'.repeat(64);db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'image/png','cas/image');
    const a=await service.execute({name:'asset.import',payload:{title:'image',kind:'image',blobSha256:hash,projectId:p.value.projectId}},'image');
    if(a.status!=='completed')throw new Error('expected');
    db.runSync("INSERT INTO creative_asset_versions VALUES('v2',?,2,'generated','{}',2)",a.value.assetId);db.runSync("INSERT INTO creative_version_files VALUES('v2','original',?,'AVAILABLE')",hash);
    const command={name:'project.setCover' as const,payload:{id:p.value.projectId,expectedRevision:0,versionId:a.value.versionId}};
    await service.execute(command,'cover');await service.execute(command,'cover');
    await service.execute({name:'asset.setDefaultVersion',payload:{id:a.value.assetId,expectedRevision:0,versionId:'v2'}},'default');
    expect((await service.covers())[0].version_id).toBe(a.value.versionId);
    await expect(service.execute({name:'asset.unlinkFromProject',payload:{assetId:a.value.assetId,projectId:p.value.projectId,expectedRevision:0}},'unlink')).rejects.toThrow('封面');
    await expect(service.execute({...command,payload:{...command.payload,versionId:'v2'}},'stale')).rejects.toThrow('REVISION_CONFLICT');
    await service.saveProjectTab(p.value.projectId,'plans');
    expect(await createCreativeService(db as never).projectTab(p.value.projectId)).toBe('plans');
    await service.execute({name:'project.setCover',payload:{id:p.value.projectId,expectedRevision:1,versionId:null}},'clear');
    await service.execute({name:'asset.unlinkFromProject',payload:{assetId:a.value.assetId,projectId:p.value.projectId,expectedRevision:0}},'unlink');
    expect(await service.covers()).toEqual([]);expect(db.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  }finally{db.close();}
});
