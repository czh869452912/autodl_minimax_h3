import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {AccessibilityInfo,Animated,Easing,PanResponder,Pressable,Text,View} from 'react-native';
import {COLORS} from '../ui/theme';

export function drawerStops(height:number){return [76,Math.max(76,height*0.70),Math.max(76,height-8)];}
export function nearestDrawerStop(height:number,current:number,velocity=0){
  const stops=drawerStops(height),projected=current-velocity*100;
  return stops.reduce((best,n,i)=>Math.abs(n-projected)<Math.abs(stops[best]-projected)?i:best,0);
}
export function ImageEditorDrawer({expanded,height,wide=false,fill=false,summary,onExpand,onCollapse,children}:{expanded:boolean;height:number;wide?:boolean;fill?:boolean;summary:ReactNode;onExpand:()=>void;onCollapse:()=>void;children:ReactNode}){
  const extent=useRef(new Animated.Value(76)).current,current=useRef(76),start=useRef(76),snap=useRef(1);
  const [reduced,setReduced]=useState(true);
  const live=useRef({expanded,height,onExpand,onCollapse,reduced,fill});live.current={expanded,height,onExpand,onCollapse,reduced,fill};
  useEffect(()=>{let active=true;void AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(active)setReduced(v);}).catch(()=>undefined);const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{active=false;sub.remove();};},[]);
  useEffect(()=>{const id=extent.addListener(({value})=>{current.current=value;});return()=>extent.removeListener(id);},[extent]);
  const animate=(index:number)=>{snap.current=index||1;Animated.timing(extent,{toValue:drawerStops(live.current.height)[index&&live.current.fill?2:index],duration:live.current.reduced?0:220,easing:Easing.out(Easing.cubic),useNativeDriver:false}).start();};
  useEffect(()=>{animate(expanded?snap.current:0);return()=>extent.stopAnimation();},[expanded,height,reduced,fill]);
  const pan=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dy)>5&&Math.abs(g.dy)>Math.abs(g.dx),
    onPanResponderGrant:()=>{extent.stopAnimation();start.current=current.current;},
    onPanResponderMove:(_,g)=>{const max=drawerStops(live.current.height)[2];extent.setValue(Math.max(76,Math.min(max,start.current-g.dy)));},
    onPanResponderRelease:(_,g)=>{const index=nearestDrawerStop(live.current.height,current.current,g.vy);animate(index);if(index)live.current.onExpand();else live.current.onCollapse();},
    onPanResponderTerminate:()=>animate(live.current.expanded?snap.current:0),
  }),[]);
  return <Animated.View testID="image-workbench-tools" style={{position:'absolute',bottom:0,left:wide?undefined:0,right:0,width:wide?Math.min(520,Math.max(360,height)):undefined,height:extent,zIndex:20,elevation:12,shadowColor:'#000',shadowOffset:{width:0,height:-3},shadowOpacity:0.12,shadowRadius:10,borderTopLeftRadius:16,borderTopRightRadius:16,borderWidth:0.5,borderColor:COLORS.border,overflow:'hidden',backgroundColor:COLORS.surface}}>
    <View {...pan.panHandlers}><Pressable accessibilityRole="adjustable" accessibilityLabel="拖动编辑抽屉" accessibilityValue={{text:expanded?'已展开':'已收起'}} accessibilityActions={[{name:'increment',label:'展开'},{name:'decrement',label:'收起'}]} onAccessibilityAction={e=>e.nativeEvent.actionName==='increment'?onExpand():onCollapse()} onPress={expanded?onCollapse:onExpand} style={{height:24,alignItems:'center',justifyContent:'center'}}><View style={{width:36,height:4,borderRadius:2,backgroundColor:COLORS.border}}/></Pressable></View>
    {expanded?<View style={{flex:1,minHeight:0}}>{children}</View>:<View style={{flex:1,justifyContent:'center',paddingHorizontal:12}}>{summary}</View>}
  </Animated.View>;
}
