import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {prepareMediaReview,dispatchMediaReview} from './mediaReview';
import {quarantineRestoredExecution} from '../storage/restoreIsolation';
async function fixture(){
 const db=createInitializedRealSqliteTestDb();let n=0;const service=createCreativeService(db as never,{id:()=>`m-${++n}`,now:()=>100});
 const command=async(name:any,payload:any)=>{const r=await service.execute({name,payload},`c-${++n}`);if(r.status!=='completed')throw Error('expected');return r.value;};
 const {projectId}=await command('project.create',{title:'p'});const hash='a'.repeat(64),frame='b'.repeat(64);
 db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'video/mp4','cas/a');db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',frame,'image/jpeg','cas/b');
 const {versionId}=await command('asset.import',{title:'video',kind:'video',blobSha256:hash,projectId});
 const connection={id:'connection',revision:1,title:'model',endpoint:'https://example.com/v1',model:'vision',apiKey:'secret',images:true,revoked:false};
 const input={projectId,versionId,sourceHash:hash,connection,prompt:'Check',frames:[{sha256:frame,timestampMs:0}]};
 return {db,input,connection};
}
test('perceptual review freezes permitted frames, uses one dispatch and records only a report',async()=>{
 const f=await fixture();try{
  const id=await prepareMediaReview(f.db as never,f.input,100),send=jest.fn(async()=>({report:'visible issue',usage:{total_tokens:22}}));
  await dispatchMediaReview(f.db as never,id,f.connection,send,200);
  await expect(dispatchMediaReview(f.db as never,id,f.connection,send,200)).rejects.toThrow('EXPIRED');
  expect(send).toHaveBeenCalledTimes(1);expect(f.db.getFirstSync('SELECT state,report FROM creative_media_reviews')).toEqual({state:'DONE',report:'visible issue'});
  expect(f.db.getAllSync('SELECT * FROM workflow_jobs')).toEqual([]);expect(f.db.getAllSync('SELECT * FROM creative_shot_assets')).toEqual([]);
  expect(JSON.stringify(f.db.getAllSync('SELECT * FROM creative_media_reviews'))).not.toContain('secret');
 }finally{f.db.close();}
});
test.each(['revoked','model','expired','restored','outcome-unknown'] as const)('review %s never silently replays',async mode=>{
 const f=await fixture();try{
  const id=await prepareMediaReview(f.db as never,f.input,100),send=jest.fn(async()=>({report:'ok'}));
  const connection={...f.connection};if(mode==='revoked')connection.revoked=true;if(mode==='model')connection.model='other';
  if(mode==='restored')quarantineRestoredExecution(f.db as never,'f'.repeat(32));if(mode==='outcome-unknown')send.mockRejectedValue(new Error('network lost'));
  await expect(dispatchMediaReview(f.db as never,id,connection,send,mode==='expired'?1000000:200)).rejects.toThrow();
  if(mode!=='outcome-unknown')expect(send).not.toHaveBeenCalled();else{expect(f.db.getFirstSync('SELECT state FROM creative_media_reviews')).toEqual({state:'UNKNOWN'});await expect(dispatchMediaReview(f.db as never,id,connection,send,300)).rejects.toThrow('EXPIRED');expect(send).toHaveBeenCalledTimes(1);}
 }finally{f.db.close();}
});
