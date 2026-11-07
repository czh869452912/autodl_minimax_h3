import React from 'react';
import {act,create} from 'react-test-renderer';
import {ListAction} from '../ui/ListPageUI';
import {GenerationRequestReview,GenerationRequestDetails,type GenerationPreview} from './GenerationRequestReview';
import {defaultNovelAiDraft,prepareNovelAiRequest} from './novelAiProtocol';

jest.mock('./WorkbenchUI',()=>({ParameterSheet:({children}:any)=>children}));
function render(snapshot:Record<string,unknown>,request:Record<string,unknown>,versionIds:string[]=[],evidence=false){
 let tree!:ReturnType<typeof create>;
 const preview={draft:{id:'draft',provider_id:'novelai',revision:0},account:{account_binding_id:'account',credential_generation_id:'credential'},prepared:{inputSnapshot:snapshot,requestInput:request},versionIds} as GenerationPreview;
 act(()=>{tree=create(<GenerationRequestDetails preview={preview}/>);});
 if(evidence)act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='查看版本与技术证据')!.props.onPress());
 const output=JSON.stringify(tree.toJSON());act(()=>tree.unmount());return output;
}
test('reviews actual prepared image parameters and expanded text rather than editable draft defaults',()=>{
 const prepared=prepareNovelAiRequest({...defaultNovelAiDraft,prompt:'A lighthouse',guidance:6.5,useCoordinates:true,characters:[{prompt:'Keeper',negative:'hat',enabled:true,x:0.25,y:0.75}]},()=>0.5);
 const request=JSON.parse(prepared.requestJson),text=render(prepared.snapshot,request);
 expect(text).toContain(request.input);expect(text).toContain('提示词引导：6.5');expect(text).toContain('噪声计划：karras');expect(text).toContain('(0.25, 0.75)');
});
test('reviews infill controls and fixed mask identity without rendering encoded pixels',()=>{
 const prepared=prepareNovelAiRequest({...defaultNovelAiDraft,prompt:'Repair',action:'infill',sourceVersionId:'source-v1',maskVersionId:'mask-v2',strength:0.65,noise:0.1,inpaintStrength:0.8},()=>0.5,{image:'PRIVATE_IMAGE_PIXELS',mask:'PRIVATE_MASK_PIXELS'});
 const text=render(prepared.snapshot,JSON.parse(prepared.requestJson),['source-v1','mask-v2'],true);
 for(const value of ['操作：infill','底图变化强度：0.65','底图噪声：0.1','重绘内图生图强度：0.8','mask-v2'])expect(text).toContain(value);
 expect(text).not.toContain('PRIVATE_IMAGE_PIXELS');expect(text).not.toContain('PRIVATE_MASK_PIXELS');
});
test('standalone upscale retains source dimensions and shows its real output instead of undefined image parameters',()=>{
 const text=render({operation:'upscale',width:832,height:1216,factor:2},{model:'nai-diffusion-5-curated',image:'PRIVATE_PIXELS',declared_blur_sigma:0},['source-v1']);
 for(const value of ['宽：832','高：1216','输出尺寸：1664 × 2432','不发送提示词','图片张数：1'])expect(text).toContain(value);
 expect(text).not.toContain('PRIVATE_PIXELS');expect(text).not.toContain('NaN');
});


test.each(['revision','account','request','versions'])('review changes reset both permissions (%s)',kind=>{
 const preview={draft:{id:'draft',provider_id:'novelai',revision:0},account:{account_binding_id:'account',credential_generation_id:'g1'},prepared:{inputSnapshot:{},requestInput:{}},versionIds:[]} as unknown as GenerationPreview;
 const props={preview,onClose:jest.fn(),onConfirm:jest.fn(async()=>{}),error:'',busy:false};let tree!:ReturnType<typeof create>;
 const confirm=()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='确认许可并生成 1 次')!;
 try{act(()=>{tree=create(<GenerationRequestReview {...props}/>);});
 const checks=tree.root.findAll(n=>n.props.accessibilityRole==='checkbox'&&typeof n.props.onPress==='function');
 act(()=>checks[0].props.onPress());expect(confirm().props.disabled).toBe(true);
 act(()=>checks[1].props.onPress());expect(confirm().props.disabled).toBe(false);expect(props.onConfirm).not.toHaveBeenCalled();
 act(()=>tree.update(<GenerationRequestReview {...props} preview={{...preview}}/>));expect(confirm().props.disabled).toBe(false);
 const next={...preview,...(kind==='revision'?{draft:{...preview.draft,revision:1}}:kind==='account'?{account:{...preview.account,credential_generation_id:'g2'}}:kind==='request'?{prepared:{...preview.prepared,inputSnapshot:{seed:1}}}:{versionIds:['fixed-version']})} as GenerationPreview;
 act(()=>tree.update(<GenerationRequestReview {...props} preview={next}/>));expect(confirm().props.disabled).toBe(true);
 }finally{act(()=>tree?.unmount());}
});
