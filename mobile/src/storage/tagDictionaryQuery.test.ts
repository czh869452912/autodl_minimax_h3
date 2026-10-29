import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {searchTagDictionary} from './tagDictionaryQuery';
import {normalizeTagQuery,tagMatchRank} from '../creative/tagMatching';

test('bundled indexed dictionary supports word prefixes, reordered words, aliases, translation and infix',async()=>{
 const db=new DatabaseSync(path.resolve(__dirname,'../../assets/tags/danbooru-v2.db'),{readOnly:true});
 const query={getAllAsync:async<T,>(sql:string,...params:any[])=>db.prepare(sql).all(...params) as T[]};
 try{
  for(const key of ['blue ha','ha blue',' BLUE_HA ','ＢＬＵＥ　ＨＡ'])expect((await searchTagDictionary(query,key)).some(t=>t.name==='blue_hair')).toBe(true);
  expect((await searchTagDictionary(query,'blue hair'))[0].name).toBe('blue_hair');
  expect((await searchTagDictionary(query,'蓝头'))[0].name).toBe('blue_hair');
  const alias=db.prepare("SELECT full_term,tag FROM terms WHERE position=0 AND full_term<>replace(tag,'_',' ') AND length(full_term)>3 AND full_term NOT GLOB '*[^a-z ]*' LIMIT 1").get() as {full_term:string;tag:string};
  expect((await searchTagDictionary(query,alias.full_term)).some(t=>t.name===alias.tag)).toBe(true);
  expect((await searchTagDictionary(query,'oking at vie')).some(t=>t.name==='looking_at_viewer')).toBe(true);
  expect(await searchTagDictionary(query,'%%')).toEqual([]);
  expect(await searchTagDictionary(query,"'; DROP TABLE tags; --")).toEqual([]);
  expect(db.prepare('SELECT COUNT(*) AS n FROM tags').get()).toMatchObject({n:140782});
  const rows=await searchTagDictionary(query,'hair');expect(rows.length).toBeGreaterThan(4);expect(new Set(rows.map(t=>t.name)).size).toBe(rows.length);
 }finally{db.close();}
});
test('normalization and relevance prefer exact, prefix, word match, then substring',()=>{
 expect(normalizeTagQuery(' ＢＬＵＥ__hair ')).toBe('blue hair');
 expect(['blue_hair','blue_hair_band','long_blue_hair','lightblue_hair','sky'].map(tag=>tagMatchRank(tag,'blue hair'))).toEqual([0,1,2,3,4]);
});
