jest.mock('../storage/tagDictionaryStore',()=>({queryTagDictionary:jest.fn()}));
jest.mock('./accountRuntime',()=>({creativeAccounts:jest.fn()}));
import {rankSuggestions,rememberTag,type TagSuggestion} from './tagDictionary';
test('matching quality outranks popularity and recency; canonical duplicates merge without losing local metadata',()=>{
 rememberTag('long_blue_hair');
 const items:TagSuggestion[]=[{name:'long_blue_hair',source:'local',count:1000000},{name:'blue_hair',source:'local',count:1,translation:'蓝头发'},{name:'BLUE HAIR',source:'official'},{name:'blue_hair_band',source:'local',count:10}];
 const ranked=rankSuggestions(items,'blue hair');
 expect(ranked).toHaveLength(3);expect(ranked[0]).toMatchObject({name:'BLUE HAIR',translation:'蓝头发'});
 expect(ranked[1].name).toBe('blue_hair_band');
 expect(rankSuggestions(Array.from({length:30},(_,i)=>({name:`hair_${i}`,source:'local' as const})),'hair')).toHaveLength(30);
});
