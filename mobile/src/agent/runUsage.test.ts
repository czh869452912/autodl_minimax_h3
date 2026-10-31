import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {reserveRunCall,RUN_LIMITS} from './runUsage';
test('run-wide counters survive new services, contend atomically and reject restored epochs',async()=>{
 const db=createInitializedRealSqliteTestDb();try{
 for(let i=0;i<RUN_LIMITS.modelCalls-1;i++)await reserveRunCall(db as never,'t','r','model',10,100);
 const race=await Promise.allSettled([reserveRunCall(db as never,'t','r','model',10,100),reserveRunCall(db as never,'t','r','model',10,100)]);
 expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(db.getFirstSync('SELECT model_calls,estimated_tokens FROM creative_run_usage')).toEqual({model_calls:32,estimated_tokens:320});
 await expect(reserveRunCall(db as never,'t','r','tool',0,100+RUN_LIMITS.durationMs)).rejects.toThrow('DURATION_LIMIT');
 await reserveRunCall(db as never,'t','tokens','model',RUN_LIMITS.estimatedTokens,100);
 await expect(reserveRunCall(db as never,'t','tokens','model',1,100)).rejects.toThrow('TOKEN_LIMIT');
 db.runSync("UPDATE creative_execution_state SET epoch='new' WHERE id=1");
 await expect(reserveRunCall(db as never,'t','r','tool',0,100)).rejects.toThrow('RESTORED');
 }finally{db.close();}
});
