import {estimateAnlas} from './anlasEstimate';
import {defaultNovelAiDraft as base} from './novelAiProtocol';
import {parseNovelAiUsage} from './novelAiUsage';
const opus=parseNovelAiUsage({active:true,tier:3,usage:{percent:100,isNegative:false}},1000);
const paid={...opus,tier:1};
test('matches current public web pricing vectors including Medium coefficient and batch allowance',()=>{
 expect(estimateAnlas(base,paid,1000)).toMatchObject({amount:26,usesAllowance:false});
 expect(estimateAnlas({...base,effort:'medium'},paid,1000)).toMatchObject({amount:17});
 expect(estimateAnlas(base,opus,1000)).toMatchObject({amount:0,usesAllowance:true});
 expect(estimateAnlas({...base,samples:4},opus,1000)).toMatchObject({amount:78});
 expect(estimateAnlas({...base,model:'nai-diffusion-4-5-full'},paid,1000)).toMatchObject({amount:17});
 expect(estimateAnlas({...base,action:'img2img',strength:0.5},paid,1000)).toMatchObject({amount:13});
});
test('never fabricates free estimates from stale, missing or exhausted allowance and unknown operations',()=>{
 expect(estimateAnlas(base,undefined,1000).status).toBe('unknown');
 expect(estimateAnlas(base,opus,62000).status).toBe('unknown');
 expect(estimateAnlas(base,{...opus,limit:null},1000).status).toBe('unknown');
 expect(estimateAnlas(base,{...opus,limit:{...opus.limit!,unavailable:true}},1000)).toMatchObject({amount:26});
 expect(estimateAnlas({...base,width:0},paid,1000).status).toBe('unknown');
 expect(estimateAnlas(base,opus,1000,'upscale').status).toBe('unknown');
 expect(estimateAnlas({...base,enhance:true},opus,1000).status).toBe('unknown');
});
