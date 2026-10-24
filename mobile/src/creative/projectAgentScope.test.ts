import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createLocalThreadStore} from '../agent/threadStore';
import {bindProjectConversation} from './projectAgentScope';

test('project conversations, search and pagination stay in scope and cannot be rebound',async()=>{
  const db=createInitializedRealSqliteTestDb();
  try{
    for(const id of ['p','other'])db.runSync('INSERT INTO creative_projects VALUES(?,?,?,0,NULL,1,1)',id,id,'');
    const store=createLocalThreadStore(db as never);
    for(const [threadId,project] of [['a','p'],['b','other'],['c','p']]){
      await store.save({threadId,messages:[],state:{},createdAt:1,updatedAt:1,customTitle:'observatory'});
      await bindProjectConversation(db as never,threadId,project);
    }
    await expect(store.listSummaries({projectId:'p',query:'observatory'})).resolves.toEqual(expect.arrayContaining([expect.objectContaining({threadId:'a'}),expect.objectContaining({threadId:'c'})]));
    expect(await store.listSummaries({projectId:'p'})).toHaveLength(2);
    expect(await store.listSummaries({projectId:'p',limit:1,offset:1})).toHaveLength(1);
    await expect(bindProjectConversation(db as never,'a','other')).rejects.toThrow('其他项目');
    await bindProjectConversation(db as never,'a','p');
    expect(db.getFirstSync<{project_id:string}>('SELECT project_id FROM creative_agent_scopes WHERE thread_id=?','a')?.project_id).toBe('p');
    db.runSync('UPDATE creative_projects SET archived_at=2 WHERE id=?','p');
    await expect(bindProjectConversation(db as never,'a','p')).rejects.toThrow('归档');
  }finally{db.close();}
});
