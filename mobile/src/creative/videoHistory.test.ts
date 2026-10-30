import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {readVideoHistory} from './videoHistory';
import type {CreativeDraft} from './drafts';

test('450 rounds use chunked reads and media summaries without transferring full recipes',async()=>{
  const db=createInitializedRealSqliteTestDb();
  try{
    db.runSync("INSERT INTO creative_assets VALUES('asset','video','test',NULL,0,0,0)");
    db.runSync("INSERT INTO creative_assets VALUES('foreign','video','other',NULL,0,0,0)");
    for(let i=0;i<451;i++){
      const asset=i===450?'foreign':'asset',session=i===450?'other':'session';
      db.runSync("INSERT INTO workflow_jobs(id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at,started_at,execution_duration) VALUES(?,'video','1','hash','autodl','1','{}','SUCCEEDED',?,?,?,2)",`j${i}`,i,i,i+1);
      db.runSync("INSERT INTO creative_generation_drafts VALUES(?,NULL,NULL,?,'autodl','video',?,0,'SUBMITTED',?,?,?)",`d${i}`,asset,JSON.stringify({schemaVersion:2,sessionId:session}),`j${i}`,i,i);
      // Output links are authoritative even if unrelated recipe text is invalid.
      db.runSync("INSERT INTO creative_asset_versions VALUES(?,?,?,'generated','invalid legacy recipe',?)",`v${i}`,asset,i+1,i);
      db.runSync('INSERT INTO creative_output_links VALUES(?,?,?)',`j${i}`,'output',`v${i}`);
    }
    const source=db.getFirstSync<CreativeDraft>("SELECT * FROM creative_generation_drafts WHERE id='d0'")!;
    const read=jest.spyOn(db,'getAllAsync');
    const result=await readVideoHistory(db as never,source);
    expect(result.rounds).toHaveLength(450);
    expect(result.rounds[0].job).toMatchObject({id:'j449',started_at:450,execution_duration:2});
    expect(result.rounds[0].versions[0].recipe).toEqual({jobId:'j449'});
    expect(read).toHaveBeenCalledTimes(7); // one scoped draft query + 3 chunks × jobs/outputs
    expect(result.rounds.some(row=>row.job.id==='j450')).toBe(false);
    const first=await readVideoHistory(db as never,source,{});expect(first.rounds).toHaveLength(40);expect(first.rounds[0].ordinal).toBe(450);
    const ids=first.rounds.map(r=>r.job.id);let cursor=first.next;
    while(cursor){const page=await readVideoHistory(db as never,source,{after:cursor});ids.push(...page.rounds.map(r=>r.job.id));cursor=page.next;}
    expect(ids).toHaveLength(450);expect(new Set(ids).size).toBe(450);
    expect((await readVideoHistory(db as never,source,{jobId:'j0'})).rounds[0].ordinal).toBe(1);
    expect((await readVideoHistory(db as never,source,{jobId:'j450'})).rounds).toEqual([]);
  }finally{db.close();}
});

test('legacy recipe-linked outputs remain discoverable without adopting another assets output',async()=>{
  const db=createInitializedRealSqliteTestDb();
  try{
    db.runSync("INSERT INTO creative_assets VALUES('asset','video','test',NULL,0,0,0)");
    db.runSync("INSERT INTO workflow_jobs(id,workflow_id,workflow_version,workflow_hash,adapter_id,adapter_version,input_json,status,created_at,updated_at) VALUES('job','video','1','hash','autodl','1','{}','RUNNING',1,1)");
    db.runSync("INSERT INTO creative_generation_drafts VALUES('draft',NULL,NULL,'asset','autodl','video','{}',0,'SUBMITTED','job',1,1)");
    db.runSync("INSERT INTO creative_asset_versions VALUES('old','asset',1,'generated',?,1)",JSON.stringify({jobId:'job',input:{prompt:'large old prompt'}}));
    const source=db.getFirstSync<CreativeDraft>("SELECT * FROM creative_generation_drafts WHERE id='draft'")!;
    const result=await readVideoHistory(db as never,source);
    expect(result.rounds[0].versions[0]).toMatchObject({id:'old',recipe:{jobId:'job'}});
    expect(result.rounds[0].versions[0].recipe.input).toBeUndefined();
  }finally{db.close();}
});
