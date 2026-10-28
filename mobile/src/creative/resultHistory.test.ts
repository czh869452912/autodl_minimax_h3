import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {readResultHistoryPage} from './resultHistory';

test('1000 versions page without gaps, search beyond page one, and adjacent navigation crosses a page boundary',async()=>{
  const db=createInitializedRealSqliteTestDb();
  try{
    db.runSync("INSERT INTO creative_assets VALUES('asset','image','test',NULL,0,0,0)");
    for(let i=0;i<1000;i++)db.runSync("INSERT INTO creative_asset_versions VALUES(?,'asset',?,'generated',?,?)",`v${String(i).padStart(4,'0')}`,i+1,JSON.stringify({jobId:i%2?'odd':'even',input:{prompt:i===4?'needle':'sky',seed:i}}),Math.floor(i/3));
    const scope={assetIds:['asset']};
    const first=await readResultHistoryPage(db as never,scope);
    expect(first.ids).toHaveLength(40);
    // An inserted head must not shift the keyset cursor.
    db.runSync("INSERT INTO creative_asset_versions VALUES('new','asset',1001,'generated','{}',999)");
    const found=[...first.ids];let cursor=first.next;
    while(cursor){const page=await readResultHistoryPage(db as never,{...scope,after:cursor});found.push(...page.ids);cursor=page.next;}
    expect(found).toHaveLength(1000);expect(new Set(found).size).toBe(1000);
    expect((await readResultHistoryPage(db as never,{...scope,query:'needle'})).ids).toEqual(['v0004']);
    expect((await readResultHistoryPage(db as never,{...scope,jobId:'odd',limit:100})).ids).toHaveLength(100);
    const older=await readResultHistoryPage(db as never,{...scope,after:first.next,limit:1});
    expect(older.ids).toEqual(['v0959']);
    expect((await readResultHistoryPage(db as never,{...scope,before:{createdAt:Math.floor(959/3),id:'v0959'},limit:1})).ids).toEqual(['v0960']);
    const plan=db.getAllSync<{detail:string}>("EXPLAIN QUERY PLAN SELECT id FROM creative_asset_versions WHERE asset_id='asset' ORDER BY created_at DESC,id DESC LIMIT 40");
    expect(plan.some(r=>r.detail.includes('creative_versions_asset_page'))).toBe(true);
  }finally{db.close();}
});
