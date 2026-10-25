import { useEffect } from 'react';
import { AppState, Pressable, Text } from 'react-native';

/** Kept outside the image press target so comparing never opens the viewer. */
export function HoldToCompare({active,onChange}:{active:boolean;onChange:(active:boolean)=>void}) {
  useEffect(()=>{
    const listener=AppState.addEventListener('change',state=>{if(state!=='active')onChange(false);});
    return()=>listener.remove();
  },[onChange]);
  return <Pressable accessibilityRole="button" accessibilityLabel="按住查看原图"
    accessibilityHint="按住显示原图，松开恢复结果" accessibilityState={{selected:active}}
    accessibilityActions={[{name:'activate',label:active?'恢复结果':'查看原图'}]}
    onAccessibilityAction={()=>onChange(!active)}
    onPressIn={()=>onChange(true)} onPressOut={()=>onChange(false)}
    style={{minHeight:44,paddingHorizontal:14,justifyContent:'center',borderRadius:22,backgroundColor:active?'#185e54':'rgba(18,23,27,0.82)',borderWidth:1,borderColor:'rgba(255,255,255,0.24)'}}>
    <Text style={{color:'#fff',fontSize:12,fontWeight:'600'}}>{active?'原图 · 松开恢复':'按住查看原图'}</Text>
  </Pressable>;
}
