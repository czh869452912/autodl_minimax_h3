import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';

const MotionContext=createContext(true);
export function WorkbenchMotion({children}:{children:ReactNode}) {
  const [reduced,setReduced]=useState(true);
  useEffect(()=>{
    let active=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduced(value);}).catch(()=>undefined);
    const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    return()=>{active=false;listener.remove();};
  },[]);
  return <MotionContext.Provider value={reduced}>{children}</MotionContext.Provider>;
}

/** Keeps the outgoing content mounted until its space has collapsed. */
export function WorkbenchRegion({visible,size,horizontal=false,children,testID,style}:{visible:boolean;size:number;horizontal?:boolean;children:ReactNode;testID?:string;style?:StyleProp<ViewStyle>}) {
  const reduced=useContext(MotionContext);
  const progress=useRef(new Animated.Value(visible?1:0)).current;
  const [present,setPresent]=useState(visible);
  const retained=useRef(children);
  if(visible)retained.current=children;
  useEffect(()=>{
    if(reduced){progress.setValue(visible?1:0);setPresent(visible);return;}
    if(visible)setPresent(true);
    const animation=Animated.timing(progress,{toValue:visible?1:0,duration:reduced?0:200,easing:Easing.out(Easing.cubic),useNativeDriver:false});
    animation.start(({finished})=>{if(finished&&!visible)setPresent(false);});
    return()=>animation.stop();
  },[visible,reduced,progress]);
  if(!visible&&!present)return null;
  const extent=progress.interpolate({inputRange:[0,1],outputRange:[0,size]});
  return <Animated.View testID={testID} pointerEvents={visible?'auto':'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible?'auto':'no-hide-descendants'} style={[{overflow:'hidden',minHeight:0,flexShrink:0},horizontal?{width:extent}:{height:extent},style]}>
    <View style={horizontal?{width:size,flex:1,minHeight:0}:{height:size,minHeight:0}}>{visible?children:retained.current}</View>
  </Animated.View>;
}
