import {defaultNovelAiDraft} from './novelAiProtocol';
import {defaultMetadataSelection,metadataImportPatch} from './novelAiMetadataImport';
const character={prompt:'1.2::astronomer::',negative:'hat',enabled:true,x:0.2,y:0.7};
test('default import changes text and characters without replacing settings, seed or source',()=>{
  const current={...defaultNovelAiDraft,seed:99,width:1024,sourceVersionId:'original'};
  const imported={...defaultNovelAiDraft,prompt:'1.5::星空::',negative:'text',characters:[character],seed:0,width:832};
  const patch=metadataImportPatch(current,imported,defaultMetadataSelection);
  expect({...current,...patch}).toMatchObject({prompt:'1.5::星空::',negative:'text',seed:99,width:1024,sourceVersionId:'original',qualityPreset:'none',negativePreset:'none',characters:[character]});
  expect(imported.prompt).toBe('1.5::星空::');
});
test('optional settings and zero seed import exactly, while append preserves existing characters',()=>{
  const current={...defaultNovelAiDraft,characters:[character]};
  const imported={...defaultNovelAiDraft,width:1024,height:1024,seed:0,characters:[{...character,prompt:'second'}]};
  const patch=metadataImportPatch(current,imported,{...defaultMetadataSelection,settings:true,seed:true,append:true});
  expect(patch).toMatchObject({width:1024,height:1024,seed:0,characters:[character,imported.characters[0]]});
});
test('unchecked fields stay untouched and appending beyond model limits is rejected',()=>{
  const noText={...defaultMetadataSelection,prompt:false,negative:false,characters:false,seed:true};
  expect(metadataImportPatch(defaultNovelAiDraft,{...defaultNovelAiDraft,seed:42},noText)).toEqual({seed:42});
  expect(()=>metadataImportPatch({...defaultNovelAiDraft,characters:Array(32).fill(character)},{...defaultNovelAiDraft,characters:[character]},{...defaultMetadataSelection,append:true})).toThrow();
});
