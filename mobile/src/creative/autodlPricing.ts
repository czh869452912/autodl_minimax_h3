import {getNativeHttpTransport} from '../providers/httpTransport';
import {H3_METADATA_URL,H3_WORKFLOW_ID} from '../workflows/providers/autodl/metadata';

export type VideoPrice={workflowId:string;checkedAt:number;rates:Array<{resolution:string;peak:number;offPeak:number}>};
export type VideoQuote={minimum:number;maximum:number;unit:'CNY';duration:number;resolution:string;checkedAt:number;source:string};
export const PRICE_TTL=5*60_000;
let cached:VideoPrice|undefined;
let pending:Promise<VideoPrice>|undefined;
export function parseVideoPrice(body:any,now=Date.now()):VideoPrice{
  const data=body?.data;
  if(body?.code!=='Success'||data?.uuid!==H3_WORKFLOW_ID||data.price_type!=='minimax_h3'||!Array.isArray(data.billing_config?.minimax_h3))throw new Error('价格规则暂不支持');
  const rates=data.billing_config.minimax_h3.map((r:any)=>{
    const offPeak=r.off_peak_price??r.price;
    if(!['480p','768p'].includes(r.resolution)||![r.price,offPeak].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0))throw new Error('价格数据无效');
    return {resolution:r.resolution,peak:r.price/1000,offPeak:offPeak/1000};
  });
  if(!rates.length||new Set(rates.map((r:any)=>r.resolution)).size!==rates.length)throw new Error('价格数据无效');
  return {workflowId:data.uuid,checkedAt:now,rates};
}
export function quoteVideo(price:VideoPrice|undefined,resolution:string,duration:unknown,now=Date.now()):VideoQuote|undefined{
  if(!price||now<price.checkedAt||now-price.checkedAt>=PRICE_TTL||typeof duration!=='number'||!Number.isInteger(duration)||duration<1||duration>15)return;
  if(!/^(480p|768p)[横竖]$/.test(resolution))return;
  const rate=price.rates.find(r=>r.resolution===resolution.slice(0,-1));if(!rate)return;
  return {minimum:Math.round(Math.min(rate.peak,rate.offPeak)*duration*1000)/1000,maximum:Math.round(Math.max(rate.peak,rate.offPeak)*duration*1000)/1000,unit:'CNY',duration,resolution,checkedAt:price.checkedAt,source:H3_METADATA_URL};
}
export const quoteLabel=(q:VideoQuote)=>`预估 ¥${q.minimum.toFixed(2)}${q.minimum===q.maximum?'':`–${q.maximum.toFixed(2)}`}`;
export const cachedVideoQuote=(resolution:string,duration:unknown)=>quoteVideo(cached,resolution,duration);
export function fetchVideoPrice():Promise<VideoPrice>{
  if(cached&&Date.now()-cached.checkedAt<PRICE_TTL)return Promise.resolve(cached);
  if(pending)return pending;
  pending=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10_000);
    try{const response=await getNativeHttpTransport()(H3_METADATA_URL,{signal:controller.signal});if(!response.ok)throw new Error('价格读取失败');cached=parseVideoPrice(await response.json());return cached;}
    finally{clearTimeout(timer);pending=undefined;}
  })();return pending;
}
