import {z} from 'zod';
import {Buffer} from 'buffer';
// Verified against the official standalone upscaler client, 2026-10-24.
export const NOVELAI_UPSCALE_MODEL='nai-diffusion-5-curated';
export const NOVELAI_UPSCALE_MAX_INPUT_PIXELS=3145728;
export const NOVELAI_UPSCALE_MAX_OUTPUT_PIXELS=12582912;
export const novelAiUpscaleInput=z.object({schemaVersion:z.literal(1).default(1),operation:z.literal('upscale'),sourceVersionId:z.string().min(1).max(200)}).strict();
export const isNovelAiUpscaleRequest=(body:Record<string,unknown>)=>typeof body.image==='string' && body.model===NOVELAI_UPSCALE_MODEL && !('parameters' in body) && body.declared_blur_sigma===0;
export function upscaleExpectedSize(body:Record<string,unknown>){
  if(!isNovelAiUpscaleRequest(body))throw new Error('NOVELAI_UPSCALE_REQUEST_INVALID');
  const bytes=Buffer.from(String(body.image).slice(0,48),'base64');
  if(bytes.length<24 || bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a' || bytes.subarray(12,16).toString('ascii')!=='IHDR')throw new Error('NOVELAI_UPSCALE_REQUEST_INVALID');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(width<1 || height<1 || width*height>NOVELAI_UPSCALE_MAX_INPUT_PIXELS)throw new Error('NOVELAI_UPSCALE_SOURCE_TOO_LARGE');
  return {width:width*2,height:height*2};
}
export function prepareNovelAiUpscale(input:unknown,media:{image:string;width:number;height:number}){
  const snapshot=novelAiUpscaleInput.parse(input);
  if(!Number.isInteger(media.width)||!Number.isInteger(media.height)||media.width<1||media.height<1||media.width*media.height>NOVELAI_UPSCALE_MAX_INPUT_PIXELS)throw new Error('超分原图最多 3,145,728 像素，请先缩小图片');
  if(!media.image || media.image.length>34*1024*1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(media.image) || media.image.length%4!==0)throw new Error('超分原图无效或过大');
  const requestInput={image:media.image,model:NOVELAI_UPSCALE_MODEL,declared_blur_sigma:0},size=upscaleExpectedSize(requestInput);
  if(size.width!==media.width*2 || size.height!==media.height*2)throw new Error('NOVELAI_UPSCALE_DIMENSIONS_MISMATCH');
  return {snapshot:{...snapshot,width:media.width,height:media.height,factor:2},requestInput};
}
