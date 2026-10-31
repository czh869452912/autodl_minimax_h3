import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {shotStage,draftPresentation} from './workPresentation';
import {generationReadiness} from './generationReadiness';

test('global cover selection links atomically and stale revision cannot leave a link',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
 const service=createCreativeService(db as never);
 const p=await service.execute({name:'project.create',payload:{title:'film'}},'p');
 if(p.status!=='completed')throw Error('expected');
 for(const char of ['a','b'])db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',char.repeat(64),'image/png','cas/'+char);
 const a=await service.execute({name:'asset.import',payload:{title:'global',kind:'image',blobSha256:'a'.repeat(64)}},'a');
 const b=await service.execute({name:'asset.import',payload:{title:'other',kind:'image',blobSha256:'b'.repeat(64)}},'b');
 if(a.status!=='completed'||b.status!=='completed')throw Error('expected');
 await service.execute({name:'project.setCover',payload:{id:p.value.projectId,expectedRevision:0,versionId:a.value.versionId}},'cover');
 expect((await service.links(a.value.assetId))[0].pinned_version_id).toBe(a.value.versionId);
 await expect(service.execute({name:'project.setCover',payload:{id:p.value.projectId,expectedRevision:0,versionId:b.value.versionId}},'stale')).rejects.toThrow('REVISION_CONFLICT');
 expect(await service.links(b.value.assetId)).toHaveLength(0);
 const shot=await service.execute({name:'shot.create',payload:{projectId:p.value.projectId,title:'shot'}},'shot');
 if(shot.status!=='completed')throw Error('expected');
 await service.execute({name:'shot.selectOutput',payload:{id:shot.value.shotId,expectedRevision:0,slot:'selected_image',versionId:a.value.versionId}},'adopt');
 expect(shotStage((await service.shots(p.value.projectId))[0]).kind).toBe('video');
 db.runSync("UPDATE creative_file_resources SET state='MISSING' WHERE version_id=?",a.value.versionId);
 const missing=(await service.shots(p.value.projectId))[0];
 expect(missing.selected_image).toBe(a.value.versionId);
 expect(shotStage(missing).kind).toBe('restore');
 }finally{db.close();}
});
test('readiness never offers resubmission of unknown tasks or disconnected services',()=>{
 const base={provider:'NovelAI' as const,busy:false,pending:false,unknown:false,connected:true,missingPrompt:false};
 expect(generationReadiness({...base,pending:true,unknown:true})).toMatchObject({kind:'unknown',canSubmit:false});
 expect(generationReadiness({...base,connected:false})).toMatchObject({kind:'connection',canSubmit:false});
 expect(generationReadiness({...base,missingPrompt:true})).toMatchObject({kind:'description',canSubmit:false});
 expect(generationReadiness({...base,provider:'AutoDL'}).kind).toBe('ready');
});
