import { recoverNovelAiMetadata } from './novelAiMetadata';
import { prepareNovelAiRequest } from './novelAiProtocol';
test('metadata retains raw fields while supported Unicode, weights, seed and paired characters round trip',()=>{
  const raw={Software:'NovelAI',Comment:JSON.stringify({model:'nai-diffusion-4-5-curated',seed:42,width:832,height:1216,steps:23,scale:5,v4_prompt:{use_coords:true,caption:{base_caption:'星空, {warm light}',char_captions:[{char_caption:'astronomer',centers:[{x:0.2,y:0.7}]}]}},v4_negative_prompt:{caption:{base_caption:'text',char_captions:[{char_caption:'hat'}]}},reference_strength:0.5,unrecognized:'retain me'})};
  const recovered=recoverNovelAiMetadata(raw);expect(recovered.raw).toEqual(raw);expect(recovered.notices).toHaveLength(1);
  const body=JSON.parse(prepareNovelAiRequest(recovered.input).requestJson);
  expect(body.input).toBe('星空, {warm light}');expect(body.parameters.seed).toBe(42);
  expect(body.parameters.v4_negative_prompt.caption.char_captions[0].char_caption).toBe('hat');
  expect(body.parameters.reference_strength).toBeUndefined();expect(body.parameters.unrecognized).toBeUndefined();
});
test('missing or unsupported metadata never pretends full restoration',()=>{
  expect(recoverNovelAiMetadata({}).input).toBeUndefined();
  expect(recoverNovelAiMetadata({Software:'NovelAI',Comment:'broken'}).input).toBeUndefined();
  expect(recoverNovelAiMetadata({Software:'NovelAI',Comment:JSON.stringify({width:999})}).input).toBeUndefined();
  expect(recoverNovelAiMetadata({Software:'NovelAI',Comment:'{}'}).notices.join('')).toContain('原模型');
});

test.each(['full-high','full-medium','full-medium-transparent'])('actual official %s EXIF restores Full effort and final prompt without adding presets twice',name=>{
  const evidence=require(`../../../docs/evidence/2026-10-24-novelai-v5-full/${name}.metadata.json`);
  const recovered=recoverNovelAiMetadata({Software:'NovelAI',Source:evidence.modelSource,Comment:JSON.stringify(evidence.parameters)});
  expect(recovered.input).toMatchObject({model:'nai-diffusion-5-full',effort:name==='full-high'?'high':'medium',qualityPreset:'none',negativePreset:'none'});
  const body=JSON.parse(prepareNovelAiRequest(recovered.input).requestJson);
  expect(body.input).toBe(evidence.parameters.prompt);expect(body.parameters.seed).toBe(evidence.parameters.seed);
  expect(body.parameters.v4_prompt.caption).toEqual(evidence.parameters.v4_prompt.caption);
});
