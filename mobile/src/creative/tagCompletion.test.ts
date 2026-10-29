import {completionToken,replaceCompletion} from './tagCompletion';
test.each([
 ['blue ha| extra words, sky','blue hair, |extra words, sky'],
 ['blue ha|tail, sky','blue hair, |tail, sky'],
 ['blue ha|, sky','blue hair, |sky'],
 ['blue ha|，星空','blue hair，|星空'],
 ['blue ha|','blue hair, |'],
 ['blue ha|\nkeep line','blue hair|\nkeep line'],
 ['sky, 1.2::blue ha|::, stars','sky, 1.2::blue hair|::, stars'],
 ['{{blue ha|}}, sky','{{blue hair|}}, sky'],
 ['[blue ha|], sky','[blue hair|], sky'],
 ['artist:blue ha|, sky','artist:blue hair, |sky'],
 ['🌌，blue ha| extra, sky','🌌，blue hair, |extra, sky'],
 ['sky, blue ha|  keep  spaces','sky, blue hair,  |keep  spaces'],
])('inserts only before the caret and preserves suffix: %s', (source,expected)=>{
 const caret=source.indexOf('|'),text=source.replace('|',''),token=completionToken(text,{start:caret,end:caret})!;
 const result=replaceCompletion(text,token,'blue_hair');
 expect(result.text.slice(0,result.caret)+'|'+result.text.slice(result.caret)).toBe(expected);
 expect(token.end).toBe(caret);
});
test('caret uses actual inserted UTF-16 length, including Unicode and punctuation',()=>{
 const source='🌌, blue ha rest',caret=source.indexOf(' rest');
 const result=replaceCompletion(source,completionToken(source,{start:caret,end:caret})!,'星_🌠_(sky)$');
 expect(result.text).toBe('🌌, 星 🌠 (sky)$, rest');
 expect(result.text.slice(result.caret)).toBe('rest');
 expect(completionToken('🌌blue',{start:1,end:1})).toBeUndefined();
});
test('replaces only caret tag and preserves weights and following text',()=>{
 const text='sky, 1.2::blue ha::, stars',caret=text.indexOf('::,');const token=completionToken(text,{start:caret,end:caret})!;
 expect(token.query).toBe('blue ha');expect(replaceCompletion(text,token,'blue_hair').text).toBe('sky, 1.2::blue hair::, stars');
 const middle='sky, blue ha, stars',at=middle.indexOf(' ha');expect(replaceCompletion(middle,completionToken(middle,{start:at,end:at})!,'blue_eyes').text).toBe('sky, blue eyes, ha, stars');
});
test('does not complete numeric weights, quoted text, selections or long prose',()=>{
 for(const text of ['1.2','text "blue ha','this is a long natural language sentence'])expect(completionToken(text,{start:text.length,end:text.length})).toBeUndefined();
 expect(completionToken('blue hair',{start:0,end:9})).toBeUndefined();
 expect(replaceCompletion('blue ha',completionToken('blue ha',{start:7,end:7})!,'blue_hair')).toEqual({text:'blue hair, ',caret:11});
});
