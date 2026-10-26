import {completionToken,replaceCompletion} from './tagCompletion';
test('replaces only caret tag and preserves weights and following text',()=>{
 const text='sky, 1.2::blue ha::, stars',caret=text.indexOf('::,');const token=completionToken(text,{start:caret,end:caret})!;
 expect(token.query).toBe('blue ha');expect(replaceCompletion(text,token,'blue_hair').text).toBe('sky, 1.2::blue hair::, stars');
 const middle='sky, blue ha, stars',at=middle.indexOf(' ha');expect(replaceCompletion(middle,completionToken(middle,{start:at,end:at})!,'blue_eyes').text).toBe('sky, blue eyes, stars');
});
test('does not complete numeric weights, quoted text, selections or long prose',()=>{
 for(const text of ['1.2','text "blue ha','this is a long natural language sentence'])expect(completionToken(text,{start:text.length,end:text.length})).toBeUndefined();
 expect(completionToken('blue hair',{start:0,end:9})).toBeUndefined();
 expect(replaceCompletion('blue ha',completionToken('blue ha',{start:7,end:7})!,'blue_hair')).toEqual({text:'blue hair, ',caret:11});
});
