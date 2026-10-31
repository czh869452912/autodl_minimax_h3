import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {rebuildSearchPage,searchProject} from './projectSearch';
test('full text is scoped, versioned, paginated and stale mutable source text is hidden',async()=>{
 const db=createInitializedRealSqliteTestDb();let n=0;const service=createCreativeService(db as never,{id:()=>`s-${String(++n).padStart(4,'0')}`,now:()=>1});
 const command=async(name:any,payload:any)=>{const r=await service.execute({name,payload},`c-${++n}`);if(r.status!=='completed')throw Error('expected');return r.value;};
 try{
  const {projectId}=await command('project.create',{title:'film'}),other=await command('project.create',{title:'other'});
  let first='';for(let i=0;i<34;i++){const r=await command('shot.create',{projectId,title:'镜头 '+i,description:'蓝色衣服 星河'});if(!i)first=r.shotId;}
  await command('shot.create',{projectId:other.projectId,title:'private',description:'蓝色衣服 星河'});
  const a=await rebuildSearchPage(db as never,projectId,async()=>'', '');expect(a.indexed).toBe(30);expect(a.next).toBeTruthy();
  const b=await rebuildSearchPage(db as never,projectId,async()=>'',a.next);expect(b.indexed).toBe(4);
  const page=await searchProject(db as never,projectId,'衣服 星河');expect(page.items).toHaveLength(30);expect(page.coverage).toEqual({total:34,indexed:34});
  const tail=await searchProject(db as never,projectId,'衣服 星河',page.next);expect(tail.items).toHaveLength(4);
  await command('shot.update',{id:first,expectedRevision:0,title:'changed',description:'red coat',status:'working'});
  expect((await searchProject(db as never,projectId,'衣服 星河')).coverage).toEqual({total:34,indexed:33});
  expect((await searchProject(db as never,other.projectId,'衣服')).items).toEqual([]);
  expect((await searchProject(db as never,projectId,'衣服 absent')).items).toEqual([]);
 }finally{db.close();}
});
test('verified text body indexing does not publish failed reads or races',async()=>{
 const db=createInitializedRealSqliteTestDb();let n=0;const service=createCreativeService(db as never,{id:()=>`s-${++n}`,now:()=>1});
 try{
  const p=await service.execute({name:'project.create',payload:{title:'p'}},'p');if(p.status!=='completed')throw Error('p');const projectId=p.value.projectId;
  const hash='a'.repeat(64);db.runSync('INSERT INTO artifact_blobs VALUES(?,10,?,?,1,1)',hash,'text/plain','cas/a');
  await service.execute({name:'asset.import',payload:{title:'document',kind:'document',projectId,blobSha256:hash}},'a');
  expect((await rebuildSearchPage(db as never,projectId,async()=>{throw Error('missing');})).unavailable).toHaveLength(1);
  expect((await searchProject(db as never,projectId,'正文')).items).toEqual([]);
  await rebuildSearchPage(db as never,projectId,async()=> '隐藏在正文中的关键词');
  expect((await searchProject(db as never,projectId,'正文')).items).toHaveLength(1);
  db.runSync('DELETE FROM creative_project_assets');
  expect((await searchProject(db as never,projectId,'正文')).items).toEqual([]);
 }finally{db.close();}
});
