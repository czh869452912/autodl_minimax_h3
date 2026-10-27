import {parseVideoPrice,quoteVideo,PRICE_TTL} from './autodlPricing';
import {H3_WORKFLOW_ID} from '../workflows/providers/autodl/metadata';
const metadata=()=>({code:'Success',data:{uuid:H3_WORKFLOW_ID,price:0,price_type:'minimax_h3',billing_config:{minimax_h3:[{resolution:'480p',price:40,off_peak_price:30},{resolution:'768p',price:50,off_peak_price:40}]}}});
test('billing config overrides top-level zero and estimates output seconds in CNY',()=>{
 const price=parseVideoPrice(metadata(),1000);
 expect(quoteVideo(price,'768p竖',10,1001)).toMatchObject({minimum:.4,maximum:.5,unit:'CNY'});
 expect(quoteVideo(price,'480p横',15,1001)).toMatchObject({minimum:.45,maximum:.6});
});
test('expired prices, unknown resolutions and invalid durations never become free quotes',()=>{
 const price=parseVideoPrice(metadata(),1000);
 expect(quoteVideo(price,'768p横',10,1000+PRICE_TTL)).toBeUndefined();
 expect(quoteVideo(price,'1080p横',10,1001)).toBeUndefined();
 for(const duration of [0,16,NaN,'10',2.5])expect(quoteVideo(price,'768p横',duration,1001)).toBeUndefined();
 const invalid=metadata();invalid.data.billing_config.minimax_h3[0].price=0;
 expect(()=>parseVideoPrice(invalid)).toThrow();
 expect(()=>parseVideoPrice({code:'Success',data:{price:0}})).toThrow();
});
