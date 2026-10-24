import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {prepareNovelAiUpscale,upscaleExpectedSize} from './novelAiUpscale';
import {parseNovelAiResponse} from './novelAiProtocol';
const source=readFileSync(join(__dirname,'__fixtures__/novelai-enhanced-size.png')).toString('base64');
test('standalone upscale matches the current official three-field request and preserves odd input size',()=>{
  const prepared=prepareNovelAiUpscale({operation:'upscale',sourceVersionId:'original'},{image:source,width:1467,height:2144});
  expect(Object.keys(prepared.requestInput).sort()).toEqual(['declared_blur_sigma','image','model']);
  expect(prepared.requestInput).toMatchObject({model:'nai-diffusion-5-curated',declared_blur_sigma:0});
  expect(upscaleExpectedSize(prepared.requestInput)).toEqual({width:2934,height:4288});
  expect(prepared.snapshot).toMatchObject({operation:'upscale',sourceVersionId:'original',width:1467,height:2144,factor:2});
  expect(()=>prepareNovelAiUpscale({operation:'upscale',sourceVersionId:'original'},{image:source,width:1472,height:2144})).toThrow();
  expect(()=>prepareNovelAiUpscale({operation:'upscale',sourceVersionId:'original'},{image:source,width:2048,height:2048})).toThrow();
});
test('upscaled PNG beyond generation pixel limit is accepted only for the upscale operation',()=>{
  const image=readFileSync(join(__dirname,'__fixtures__/novelai-upscaled-size.png')).toString('base64'),raw=JSON.stringify({images:[{image,index:0,seed:0}]});
  expect(()=>parseNovelAiResponse(raw)).toThrow('NOVELAI_IMAGE_TOO_LARGE');
  expect(parseNovelAiResponse(raw,true)[0]).toMatchObject({width:1664,height:2432,seed:0});
  expect(()=>parseNovelAiResponse(JSON.stringify({images:[{image,index:1,seed:0}]}),true)).toThrow();
});
