import { defaultNovelAiDraft, novelAiDraftInput, NOVELAI_SAMPLERS, prepareNovelAiRequest, parseNovelAiResponse } from './novelAiProtocol';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=';

test('PNG verification works when mobile Buffer subarray returns a plain typed array',()=>{
  const subarray=jest.spyOn(Buffer.prototype,'subarray').mockImplementation(function(this:Buffer,...args:unknown[]){const [start,end]=args as [number|undefined,number|undefined];return Uint8Array.prototype.subarray.call(new Uint8Array(this.buffer,this.byteOffset,this.byteLength),start,end) as Buffer;});
  try {
    expect(parseNovelAiResponse(JSON.stringify({images:[{image:png,index:0,seed:123}]}))[0]).toMatchObject({width:1,height:1});
    expect(require('./novelAiUpscale').upscaleExpectedSize({image:png,model:'nai-diffusion-5-curated',declared_blur_sigma:0})).toEqual({width:2,height:2});
  } finally {subarray.mockRestore();}
});
test('snapshot freezes seed, preserves character pairing and does not inject quality or negative text', () => {
  const result = prepareNovelAiRequest({ ...defaultNovelAiDraft, qualityPreset:'none',negativePreset:'none',prompt: 'a scene', characters: [{ prompt: 'astronomer', negative: 'hat', x: 0.2, y: 0.7 }] }, () => 0.5);
  const body = JSON.parse(result.requestJson);
  expect(result.snapshot.seed).toBe(2147483648);
  expect(body.parameters.seed).toBe(result.snapshot.seed);
  expect(body.parameters.v4_negative_prompt.caption.char_captions).toEqual([{ char_caption: 'hat', centers: [{ x: 0.2, y: 0.7 }] }]);
  expect(body.parameters.negative_prompt).toBe('');
  expect(body.parameters.qualityToggle).toBe(false);
  expect(prepareNovelAiRequest(result.snapshot).requestHash).toBe(result.requestHash);
});
test('unsupported inputs, dimensions and model combinations are rejected instead of silently dropped', () => {
  for (const patch of [{ width: 999 }, { width: 2048, height: 2048 }, { reference_image: 'unapproved' }, { model: 'nai-diffusion-5-curated', noiseSchedule: 'native' }, {model:'nai-diffusion-4-5-full', characters: Array(7).fill({ prompt: 'a', negative: '', x: 0.5, y: 0.5 }) }]) {
    expect(() => prepareNovelAiRequest({ ...defaultNovelAiDraft, prompt: 'scene', ...patch })).toThrow();
  }
});
test('response parser accepts actual seed and rejects malformed, oversized and unexpected multi-output data', () => {
  const raw = { images: [{ image: png, seed: 123, index: 0 }] };
  expect(parseNovelAiResponse(JSON.stringify(raw))[0]).toMatchObject({ seed: 123, width: 1, height: 1 });
  expect(() => parseNovelAiResponse(JSON.stringify({ images: [...raw.images, ...raw.images] }))).toThrow();
  expect(() => parseNovelAiResponse(JSON.stringify({ images: [{ ...raw.images[0], image: 'not png!' }] }))).toThrow();
  expect(() => parseNovelAiResponse(JSON.stringify({ images: [{ image: png, index: 0 }] }))).toThrow();
});

test('V5 Full defaults match the saved official generated-image metadata',()=>{
  const evidence=require('../../../docs/evidence/2026-10-24-novelai-v5-full/full-high.metadata.json');
  const original=evidence.parameters;
  const prompt=original.prompt.replace(/, very aesthetic, masterpiece, no text$/,'');
  const {parameters,input,model}=JSON.parse(prepareNovelAiRequest({...defaultNovelAiDraft,prompt,seed:original.seed}).requestJson);
  expect(model).toBe('nai-diffusion-5-full');expect(input).toBe(original.prompt);
  for(const key of ['width','height','steps','scale','sampler','seed','noise_schedule','straight_alpha','tag_hint_qt','tag_hint_uc_preset'])expect(parameters[key]).toEqual(original[key]);
  expect(parameters.v4_prompt.caption).toEqual(original.v4_prompt.caption);
  expect(parameters.v4_prompt.use_coords).toBe(original.v4_prompt.use_coords);
  expect(parameters.v4_prompt.use_order).toBe(original.v4_prompt.use_order);
  expect(parameters.v4_negative_prompt.caption).toEqual(original.v4_negative_prompt.caption);
  expect(parameters.v4_negative_prompt.legacy_uc).toBe(original.v4_negative_prompt.legacy_uc);
});

test('old recipes gain no quality presets and can be reproduced after migration',()=>{
  const {qualityPreset,negativePreset,effort,samples,transparent,straightAlpha,autoText,action,sourceVersionId,maskVersionId,maskStrokes,strength,noise,extraNoiseSeed,inpaintStrength,addOriginalImage,chunks,mode,...old}=defaultNovelAiDraft;
  const recovered=novelAiDraftInput.parse({...old,model:'nai-diffusion-4-5-curated',prompt:'original scene',negative:'hat'});
  const body=JSON.parse(prepareNovelAiRequest(recovered).requestJson);
  expect(body.input).toBe('original scene');expect(body.parameters.negative_prompt).toBe('hat');expect(body.parameters.straight_alpha).toBeUndefined();
});

test('Medium uses its own model, fixed sampler and steps, and paired blank character UC',()=>{
  const request=prepareNovelAiRequest({...defaultNovelAiDraft,prompt:'scene',effort:'medium',steps:42,sampler:'k_dpmpp_sde',rescale:0.8,negative:'must not send',negativePreset:'furryFocus',characters:[{prompt:'adult astronomer',negative:'must not send either',x:0.2,y:0.8}]});
  const body=JSON.parse(request.requestJson);
  expect(body.model).toBe('nai-diffusion-5-full-medium');expect(body.parameters).toMatchObject({steps:14,sampler:'k_euler_ancestral',tag_hint_uc_preset:2});expect(body.parameters.cfg_rescale).toBeUndefined();
  expect(body.parameters.v4_negative_prompt.caption.char_captions).toEqual([{char_caption:'',centers:[{x:0.2,y:0.8}]}]);
  expect(request.requestJson).not.toContain('must not send');expect(request.snapshot.negative).toBe('must not send');
});

test.each(NOVELAI_SAMPLERS)('all official samplers are sent with the matching modern EA flags: %s',sampler=>{
  const {parameters}=JSON.parse(prepareNovelAiRequest({...defaultNovelAiDraft,prompt:'scene',sampler}).requestJson);
  expect(parameters.sampler).toBe(sampler);expect(parameters.deliberate_euler_ancestral_bug).toBe(sampler==='k_euler_ancestral'?false:undefined);expect(parameters.prefer_brownian).toBe(sampler==='k_euler_ancestral'?true:undefined);
});

test('V5 accepts 32 characters, filters disabled/blank pairs, and accepts 3 megapixels',()=>{
  const c={prompt:'astronomer',negative:'hat',x:0.5,y:0.5,enabled:true};
  const chars=[...Array(30).fill(c),{...c,enabled:false},{...c,prompt:''}];
  const {parameters}=JSON.parse(prepareNovelAiRequest({...defaultNovelAiDraft,prompt:'scene',characters:chars,width:1536,height:2048}).requestJson);
  expect(parameters.v4_prompt.caption.char_captions).toHaveLength(30);expect(parameters.v4_negative_prompt.caption.char_captions).toHaveLength(30);
  expect(()=>prepareNovelAiRequest({...defaultNovelAiDraft,prompt:'scene',characters:Array(33).fill(c)})).toThrow();
});

test('transparent hint, presets, quoted text and explicit text blocks stay consistent',()=>{
  const base={...defaultNovelAiDraft,transparent:true,prompt:'a sign reads "STARS"'};
  const body=JSON.parse(prepareNovelAiRequest(base).requestJson);
  expect(body.parameters).toMatchObject({straight_alpha:true,tag_hint_transparent_background:true});expect(body.input).toContain('transparent background');expect(body.input).toMatch(/teXt: STARS$/);
  expect(JSON.parse(prepareNovelAiRequest({...base,prompt:"don't worry, it isn't dark"}).requestJson).input).not.toContain('teXt:');
  expect(JSON.parse(prepareNovelAiRequest({...base,prompt:'scene, text: HELLO'}).requestJson).input).toMatch(/text: HELLO$/);
});

test('img2img and both Full infill models send normalized binary fields and freeze the noise seed',()=>{
  const base={...defaultNovelAiDraft,prompt:'scene',seed:0,action:'img2img',sourceVersionId:'source',strength:0.4,noise:0.1} as const;
  expect(()=>prepareNovelAiRequest(base)).toThrow('底图');
  const first=prepareNovelAiRequest(base,Math.random,{image:png}), body=JSON.parse(first.requestJson);
  expect(body.parameters).toMatchObject({image:png,strength:0.4,noise:0.1,extra_noise_seed:-1,color_correct:false});expect(first.snapshot.extraNoiseSeed).toBe(-1);
  for(const effort of ['high','medium'] as const){const result=JSON.parse(prepareNovelAiRequest({...base,effort,action:'infill',maskVersionId:'mask',inpaintStrength:0.7},Math.random,{image:png,mask:png}).requestJson);expect(result.model).toBe(`nai-diffusion-5-full${effort==='medium'?'-medium':''}-inpainting`);expect(result.parameters).toMatchObject({mask:png,add_original_image:true,img2img:{strength:0.7,color_correct:true}});expect(result.parameters.sourceVersionId).toBeUndefined();}
  expect(()=>prepareNovelAiRequest({...base,model:'nai-diffusion-5-curated',action:'infill',maskVersionId:'mask'},Math.random,{image:png,mask:png})).toThrow('V5 Full');
});

test('multi-output responses are independently seeded and sorted; duplicate indexes fail',()=>{
  const images=[3,1,0,2].map(index=>({image:png,index,seed:42+index}));
  expect(parseNovelAiResponse(JSON.stringify({images})).map(i=>i.seed)).toEqual([42,43,44,45]);
  expect(()=>parseNovelAiResponse(JSON.stringify({images:[images[0],images[0]]}))).toThrow();
});

test('prompt mixes keep quality and automatic text on the base mix and preserve random choices',()=>{
  const {input}=JSON.parse(prepareNovelAiRequest({...defaultNovelAiDraft,prompt:'a sign "STARS", ||red|blue|| sky | alternate painting'}).requestJson);
  expect(input).toBe('a sign "STARS", ||red|blue|| sky , very aesthetic, masterpiece, no text, teXt: STARS| alternate painting');
  const single=JSON.parse(prepareNovelAiRequest({...defaultNovelAiDraft,prompt:"a sign 'don't panic'"}).requestJson).input;
  expect(single).toMatch(/teXt: don't panic$/);
  const characters=[{prompt:'says "RIGHT"',negative:'',x:0.8,y:0.50},{prompt:'says "LEFT"',negative:'',x:0.2,y:0.55}];
  expect(JSON.parse(prepareNovelAiRequest({...defaultNovelAiDraft,prompt:'scene',characters,useCoordinates:true}).requestJson).input).toMatch(/teXt: LEFT\n\nRIGHT$/);
});

test('maximum enhancement uses the native V5 generation flag and requires one img2img output',()=>{
  const input={...defaultNovelAiDraft,prompt:'scene',sourceVersionId:'source',action:'img2img',enhance:true};
  const {parameters}=JSON.parse(prepareNovelAiRequest(input,Math.random,{image:png}).requestJson);
  expect(parameters.upscaled_enhance).toBe(true);expect(parameters.upscale).toBeUndefined();
  for(const patch of [{samples:2},{action:'generate'},{model:'nai-diffusion-4-5-full'}])expect(()=>prepareNovelAiRequest({...input,...patch},Math.random,{image:png})).toThrow();
  const enhanced=require('node:fs').readFileSync(require('node:path').join(__dirname,'__fixtures__/novelai-enhanced-size.png'));
  expect(parseNovelAiResponse(JSON.stringify({images:[{image:enhanced.toString('base64'),index:0,seed:42}]}))[0]).toMatchObject({width:1467,height:2144});
});
