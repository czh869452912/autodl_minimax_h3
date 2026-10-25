import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, findNodeHandle, Image, Modal, PanResponder, Pressable, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HoldToCompare } from './HoldToCompare';
import { COLORS } from './theme';
export function ImagePreview({ uri, onClose, title, onPrevious, onNext, previousUri, nextUri, imageKey, comparison }: { uri: string | null; onClose(): void; title?:string; onPrevious?:()=>void; onNext?:()=>void; previousUri?:string; nextUri?:string; imageKey?:string; comparison?:{uri:string;label:string} }) {
  const [original,setOriginal]=useState(false);
  const [shown,setShown]=useState(false);
  const transition=useRef(new Animated.Value(0)).current;
  const pageX=useRef(new Animated.Value(0)).current,paging=useRef(false);
  const [handoff,setHandoff]=useState<{uri:string;direction:number}>();
  const handoffCommitted=useRef(false);
  const reducedMotion=useRef(true),closing=useRef(false);
  useEffect(()=>{
    if(!shown)return;
    let active=true;closing.current=false;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced=>{
      if(!active || closing.current)return;
      reducedMotion.current=reduced;
      if(reduced)transition.setValue(1);
      else Animated.timing(transition,{toValue:1,duration:220,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();
    }).catch(()=>{if(active)transition.setValue(1);});
    return()=>{active=false;transition.stopAnimation();};
  },[shown,Boolean(uri),transition]);
  const navigation=useRef({onPrevious,onNext,previousUri,nextUri});navigation.current={onPrevious,onNext,previousUri,nextUri};
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const current = useRef(transform);
  const viewport = useRef({ width: 0, height: 0 });
  const start = useRef({ scale: 1, distance: 0, x: 0, y: 0, touchX: 0, touchY: 0, pinched: false });
  const closeRef = useRef<View>(null);
  const lastTap = useRef(0);
  const closeHandler = useRef(onClose); closeHandler.current = onClose;
  const distance = (touches: readonly { pageX: number; pageY: number }[]) => touches.length < 2 ? 0 : Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
  const update = (scale: number, x = 0, y = 0) => {
    scale = Math.max(1, Math.min(4, scale));
    if (scale < 1.01) scale = 1;
    const maxX = viewport.current.width * (scale - 1) / 2;
    const maxY = viewport.current.height * (scale - 1) / 2;
    const next = { scale, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
    current.current = next; setTransform(next);
  };
  const settlePage=(direction: -1|0|1)=>{
    if(paging.current || closing.current)return;
    const navigate=direction>0?navigation.current.onPrevious:direction<0?navigation.current.onNext:undefined;
    const target=navigate?direction:0;
    setOriginal(false);if(direction)lastTap.current=0;
    if(reducedMotion.current){pageX.setValue(0);if(navigate){update(1);navigate();}return;}
    paging.current=true;
    Animated.timing(pageX,{toValue:target*viewport.current.width,duration:target?220:180,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start(({finished})=>{
      if(finished && !closing.current && navigate){
        const destination=target>0?navigation.current.previousUri:navigation.current.nextUri;
        if(destination){handoffCommitted.current=false;setHandoff({uri:destination,direction:target});return;}
        update(1);navigate();
      }
      paging.current=false;pageX.setValue(0);
    });
  };
  useLayoutEffect(()=>{
    pageX.stopAnimation();pageX.setValue(0);
    // The loaded destination covers the track until the new center image has decoded.
    if(handoff?.uri===uri)return;
    let second:number|undefined;
    const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{setHandoff(undefined);paging.current=false;});});
    return()=>{cancelAnimationFrame(first);if(second!==undefined)cancelAnimationFrame(second);};
  },[uri,imageKey,pageX]);
  useEffect(()=>()=>{closing.current=true;pageX.stopAnimation();},[pageX]);
  const close = () => {
    if(closing.current)return;
    closing.current=true;setOriginal(false);
    pageX.stopAnimation();
    if(reducedMotion.current){closeHandler.current();return;}
    Animated.timing(transition,{toValue:0,duration:180,easing:Easing.in(Easing.cubic),useNativeDriver:true}).start(({finished})=>{if(finished)closeHandler.current();});
  };
  useEffect(() => { setOriginal(false); update(1); }, [uri]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !paging.current && !closing.current,
    onMoveShouldSetPanResponder: () => !paging.current && !closing.current,
    onPanResponderGrant: event => {
      const touches = event.nativeEvent.touches;
      start.current = { ...current.current, distance: distance(touches), touchX: touches[0]?.pageX ?? 0, touchY: touches[0]?.pageY ?? 0, pinched: touches.length > 1 };
    },
    onPanResponderMove: event => {
      if(paging.current || closing.current)return;
      const touches = event.nativeEvent.touches;
      const nextDistance = distance(touches);
      const anchor = start.current;
      if (nextDistance) {
        pageX.setValue(0);
        anchor.pinched = true;
        if (!anchor.distance) { anchor.distance = nextDistance; anchor.scale = current.current.scale; }
        update(anchor.scale * nextDistance / anchor.distance, current.current.x, current.current.y);
      } else if (touches[0]) {
        if (anchor.distance) {
          // A remaining finger starts a fresh pan at the current transform.
          anchor.distance = 0; anchor.x = current.current.x; anchor.y = current.current.y;
          anchor.touchX = touches[0].pageX; anchor.touchY = touches[0].pageY;
        }
        const dx=touches[0].pageX-anchor.touchX,dy=touches[0].pageY-anchor.touchY;
        if(current.current.scale===1 && !anchor.pinched){
          const canNavigate=dx>0?navigation.current.onPrevious:navigation.current.onNext;
          pageX.setValue(reducedMotion.current?0:Math.abs(dx)>Math.abs(dy)?Math.max(-viewport.current.width,Math.min(viewport.current.width,dx*(canNavigate?1:0.18))):0);
        }else update(current.current.scale, anchor.x + dx, anchor.y + dy);
      }
    },
    onPanResponderRelease: (_event, gesture) => {
      if (paging.current || closing.current)return;
      if (start.current.pinched) { pageX.setValue(0);lastTap.current = 0; return; }
      if (current.current.scale === 1 && Math.abs(gesture.dx)>Math.abs(gesture.dy) && (Math.abs(gesture.dx)>80 || Math.abs(gesture.dx)>24 && Math.abs(gesture.vx)>0.5)) { settlePage(gesture.dx>0?1:-1);return; }
      if (current.current.scale === 1 && gesture.dy > 100 && Math.abs(gesture.dx) < 80) { close(); return; }
      if (Math.abs(gesture.dx) + Math.abs(gesture.dy) < 8) { const now = Date.now(); if (now - lastTap.current < 300) { update(current.current.scale > 1 ? 1 : 2); lastTap.current = 0; } else lastTap.current = now; }
      if(current.current.scale===1 && Math.abs(gesture.dx)>=8)settlePage(0);
    },
    onPanResponderTerminate: () => { lastTap.current = 0;settlePage(0); },
  }), []);
  const { scale, x, y } = transform;
  const action=(label:string,onPress:()=>void)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{minHeight:48,paddingHorizontal:12,justifyContent:'center'}}><Text style={{color:COLORS.onPrimary}}>{label==="上一个版本"?"‹":label==="下一个版本"?"›":label}</Text></Pressable>;
  return <Modal visible={Boolean(uri)} transparent statusBarTranslucent animationType="none" onRequestClose={close} onShow={() => { setShown(true); update(1);setOriginal(false); const target = findNodeHandle(closeRef.current); if (target) AccessibilityInfo.setAccessibilityFocus(target); }}>
    <Animated.View testID="image-preview-transition" style={{flex:1,opacity:transition,backgroundColor:'#0c1013'}} accessibilityViewIsModal>
      {uri?<StatusBar barStyle="light-content" backgroundColor="#0c1013"/>:null}
      <SafeAreaView style={{flex:1}}>
        <View style={{height:52,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:12}}>
          <View style={{flex:1}}><Text numberOfLines={1} style={{color:'#fff',fontSize:15,fontWeight:'600'}}>{original && comparison?comparison.label:title||'图片预览'}</Text><Text style={{color:'#aab3bb',fontSize:11,marginTop:2}}>双指缩放 · 双击放大 · 下滑关闭</Text></View>
          <Pressable ref={closeRef} accessibilityRole="button" accessibilityLabel="关闭图片预览" onPress={close} style={{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'#252c31'}}><Text style={{color:'#fff',fontSize:26}}>×</Text></Pressable>
        </View>
        <Animated.View style={{flex:1,minHeight:0,transform:[{scale:transition.interpolate({inputRange:[0,1],outputRange:[0.96,1]})}]}}>
          <View onLayout={event => { viewport.current = event.nativeEvent.layout; update(current.current.scale, current.current.x, current.current.y); }} style={{flex:1,overflow:'hidden'}} {...pan.panHandlers}>
            <Animated.View testID="image-page-track" style={{width:'100%',height:'100%',transform:[{translateX:pageX}]}}>
              {previousUri?<Image fadeDuration={0} accessible={false} source={{uri:previousUri}} resizeMode="contain" style={{position:'absolute',left:'-100%',width:'100%',height:'100%'}}/>:null}
              {nextUri?<Image fadeDuration={0} accessible={false} source={{uri:nextUri}} resizeMode="contain" style={{position:'absolute',left:'100%',width:'100%',height:'100%'}}/>:null}
            {uri?<Image fadeDuration={0} key={imageKey??uri} onLoad={()=>{if(handoff?.uri===uri){requestAnimationFrame(()=>{setHandoff(undefined);paging.current=false;});}}} testID="reference-image-preview" accessibilityLabel="图片预览，双指缩放，双击放大，向下滑动关闭" source={{uri:original && comparison?comparison.uri:uri}} resizeMode="contain" style={{width:'100%',height:'100%',transform:[{translateX:x},{translateY:y},{scale}]}}/>:null}
            </Animated.View>
          </View>
          {handoff?<Image fadeDuration={0} testID="page-handoff" source={{uri:handoff.uri}} resizeMode="contain" style={{position:'absolute',inset:0,backgroundColor:'#0c1013'}} onLoad={()=>{
            if(handoffCommitted.current || closing.current)return;
            handoffCommitted.current=true;update(1);
            (handoff.direction>0?navigation.current.onPrevious:navigation.current.onNext)?.();
          }} onError={()=>{setHandoff(undefined);pageX.setValue(0);paging.current=false;}}/>:null}
          {comparison?<View style={{position:'absolute',right:16,bottom:16}}><HoldToCompare active={original} onChange={setOriginal}/></View>:null}
        </Animated.View>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',paddingHorizontal:8,paddingVertical:6,gap:4}}>
          {onPrevious?action('上一个版本',()=>settlePage(1)):null}
          {action('缩小',()=>update(current.current.scale-0.5))}
          <Pressable accessibilityRole="button" accessibilityLabel="还原图片缩放" onPress={()=>update(1)} style={{minWidth:54,minHeight:44,justifyContent:'center'}}><Text style={{color:'#aab3bb',textAlign:'center',fontSize:12}}>{Math.round(scale*100)}%</Text></Pressable>
          {action('放大',()=>update(current.current.scale+0.5))}
          {onNext?action('下一个版本',()=>settlePage(-1)):null}
        </View>
      </SafeAreaView>
    </Animated.View>
  </Modal>;
}
