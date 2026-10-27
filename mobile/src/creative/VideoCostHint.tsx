import {useCallback,useState} from 'react';
import {Alert,Pressable,Text} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {fetchVideoPrice,quoteLabel,quoteVideo,type VideoPrice} from './autodlPricing';
import {COLORS} from '../ui/theme';

export function VideoCostHint({enabled,resolution,duration,inline=false}:{enabled:boolean;resolution:string;duration:unknown;inline?:boolean}){
  const [price,setPrice]=useState<VideoPrice>(),[now,setNow]=useState(Date.now());
  useFocusEffect(useCallback(()=>{
    if(!enabled)return;let active=true;
    const refresh=()=>{setNow(Date.now());void fetchVideoPrice().then(p=>{if(active)setPrice(p);}).catch(()=>{if(active)setPrice(undefined);});};
    refresh();const timer=setInterval(refresh,60_000);return()=>{active=false;clearInterval(timer);};
  },[enabled]));
  const quote=enabled?quoteVideo(price,resolution,duration,Math.max(now,Date.now())):undefined;
  return <Pressable accessibilityRole="button" accessibilityLabel="视频预估费用说明" onPress={()=>Alert.alert('视频预估费用',quote?`${quoteLabel(quote)}\n${resolution} · ${String(duration)} 秒\n按官网高峰与空闲单价给出区间，不代表最终扣款。排队与运行耗时不计入视频秒数。\n价格更新：${new Date(quote.checkedAt).toLocaleTimeString()}`:'暂无法估价。未知或过期价格不会按免费处理，可稍后重试。')} style={{paddingVertical:4,paddingHorizontal:inline?10:0,minHeight:inline?44:undefined,justifyContent:'center',maxWidth:inline?'48%':undefined,backgroundColor:inline?'rgba(0,0,0,0.12)':undefined}}><Text style={{color:inline?COLORS.onPrimary:COLORS.textMuted,fontSize:12,textAlign:'center'}}>{quote?quoteLabel(quote):'暂无法估价'} ⓘ</Text></Pressable>;
}
