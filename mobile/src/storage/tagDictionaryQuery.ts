import {normalizeTagQuery} from '../creative/tagMatching';
export type DictionaryTag = {name: string; category: number; count: number; translation: string; matchRank: number};
export type TagQueryDatabase = {getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]>};
/** Indexed word-prefix search first, literal substring fallback only for sparse results. */
export async function searchTagDictionary(db: TagQueryDatabase, query: string): Promise<DictionaryTag[]> {
 const key = normalizeTagQuery(query);
 if (key.length < 2 || key.length > 80) return [];
 const parts = [...new Set(key.split(' '))];
 if (parts.length > 5) return [];
 const first = [...parts].sort((a, b) => b.length - a.length)[0];
 const filters = parts.map(() => 'instr(s.full_term,?)>0').join(' AND ');
 const select = `SELECT t.name,t.category,t.count,t.translation,MIN(CASE WHEN s.full_term=? THEN 0 WHEN substr(s.full_term,1,length(?))=? THEN 1 ELSE 2 END) AS matchRank FROM terms s JOIN tags t ON t.name=s.tag`;
 const rows = await db.getAllAsync<DictionaryTag>(`${select} WHERE s.term>=? AND s.term<? AND ${filters} GROUP BY t.name ORDER BY matchRank,t.count DESC,t.name LIMIT 40`, key,key,key,first,first+'\uffff',...parts);
 if (rows.length >= 40 || key.length < 3) return rows;
 const extra = await db.getAllAsync<DictionaryTag>(`SELECT t.name,t.category,t.count,t.translation,3 AS matchRank FROM terms s JOIN tags t ON t.name=s.tag WHERE s.position=0 AND ${filters} GROUP BY t.name ORDER BY t.count DESC,t.name LIMIT 40`,...parts);
 const seen = new Set(rows.map(row => row.name));
 return [...rows, ...extra.filter(row => !seen.has(row.name))].slice(0,40);
}
