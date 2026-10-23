import {compareRecipeFields} from './recipeDiff';
test('key ordering is irrelevant; missing, null and nested values remain distinct',()=>{
  expect(compareRecipeFields({b:2,a:1},{a:1,b:2}).rows).toEqual([]);
  expect(compareRecipeFields({a:null,n:{seed:1},'a/b':1},{n:{seed:2},'a/b':2}).rows).toEqual([
    {path:'/a',before:'null',after:'（未记录）'},
    {path:'/a~1b',before:'1',after:'2'},
    {path:'/n/seed',before:'1',after:'2'},
  ]);
});
test('ordered arrays and hostile field names are data; rendering is bounded',()=>{
  expect(compareRecipeFields({characters:['a','b']},{characters:['b','a']}).rows).toHaveLength(1);
  expect(compareRecipeFields(JSON.parse('{"__proto__":1}'),{}).rows[0].path).toBe('/__proto__');
  expect(compareRecipeFields({a:1,b:2},{a:2,b:3},1)).toMatchObject({truncated:true,rows:[{path:'/a'}]});
});
