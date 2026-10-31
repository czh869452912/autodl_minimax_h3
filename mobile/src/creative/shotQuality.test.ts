import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {inspectShotQuality} from './shotQuality';
test('quality inspection is scoped and read-only and never claims perceptual review',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
  const service=createCreativeService(db as never);
  const p=await service.execute({name:'project.create',payload:{title:'film'}},'project');if(p.status!=='completed')throw new Error('expected');
  const s=await service.execute({name:'shot.create',payload:{projectId:p.value.projectId,title:'opening'}},'shot');if(s.status!=='completed')throw new Error('expected');
  const before=db.getFirstSync('SELECT total_changes() AS n');
  const result=await inspectShotQuality(db as never,p.value.projectId,s.value.shotId);
  expect(result.findings.map(f=>f.code)).toEqual(['SHOT_DESCRIPTION_EMPTY','IMAGE_NOT_ADOPTED','VIDEO_NOT_ADOPTED']);
  expect(result.notChecked).toContain('visual_identity');expect(result.adoptionAllowed).toBe(false);
  expect(db.getFirstSync('SELECT total_changes() AS n')).toEqual(before);
  await expect(inspectShotQuality(db as never,'other',s.value.shotId)).rejects.toThrow('SCOPE_MISMATCH');
 }finally{db.close();}
});
