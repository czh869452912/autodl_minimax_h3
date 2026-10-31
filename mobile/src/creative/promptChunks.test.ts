import {expandPromptChunks} from './promptChunks';
import {defaultNovelAiDraft,prepareNovelAiRequest} from './novelAiProtocol';
test('chunks expand in base, UC and character prompts before request serialization',()=>{
 const chunks=[{name:'style',text:'watercolor'},{name:'person',text:'blue hair, !macro:style!'}];
 const {requestJson,snapshot}=prepareNovelAiRequest({...defaultNovelAiDraft,prompt:'!macro:person!',negative:'!macro:style!',chunks,characters:[{prompt:'!macro:person!',negative:'!macro:style!',enabled:true,x:.5,y:.5}]},()=>0);
 const request=JSON.parse(requestJson);expect(request.input).toContain('blue hair, watercolor');expect(request.parameters.negative_prompt).toContain('watercolor');expect(request.parameters.v4_prompt.caption.char_captions[0].char_caption).toBe('blue hair, watercolor');expect(requestJson).not.toContain('!macro:');expect(snapshot.prompt).toBe('!macro:person!');
});
test('missing, duplicate, cyclic and oversized chunks fail before generation',()=>{
 expect(()=>expandPromptChunks('!macro:X!',[])).toThrow('找不到');
 expect(()=>expandPromptChunks('!macro:x!',[{name:'x',text:'a'},{name:'x',text:'b'}])).toThrow('重复');
 expect(()=>expandPromptChunks('!macro:x!',[{name:'x',text:'!macro:y!'},{name:'y',text:'!macro:x!'}])).toThrow('循环');
 expect(()=>expandPromptChunks('!macro:x! !macro:x!',[{name:'x',text:'a'.repeat(6000)}])).toThrow('10000');
});
