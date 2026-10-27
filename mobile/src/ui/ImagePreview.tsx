import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, findNodeHandle, Image, Modal, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useImageGestures } from './useImageGestures';
import { HoldToCompare } from './HoldToCompare';
import {ImageOverlayAction} from './ImageOverlayAction';
export function ImagePreview({ uri, onClose, title, onPrevious, onNext, previousUri, nextUri, imageKey, comparison }: { uri: string | null; onClose(): void; title?:string; onPrevious?:()=>void; onNext?:()=>void; previousUri?:string; nextUri?:string; imageKey?:string; comparison?:{uri:string;label:string} }) {
  const [original,setOriginal]=useState(false);
  const [shown,setShown]=useState(false);
  const transition=useRef(new Animated.Value(0)).current;
  const pageX=useRef(new Animated.Value(0)).current,paging=useRef(false);
  const pendingPage=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
  const viewport = useRef({ width: 0, height: 0 });
  const closeRef = useRef<View>(null);
  const closeHandler = useRef(onClose); closeHandler.current = onClose;
  const zoom = useImageGestures({identity:imageKey??uri??'', blocked:()=>paging.current||closing.current,
    onSwipeMove:(dx,dy)=>{const canNavigate=dx>0?navigation.current.onPrevious:navigation.current.onNext;pageX.setValue(reducedMotion.current?0:Math.abs(dx)>Math.abs(dy)?Math.max(-viewport.current.width,Math.min(viewport.current.width,dx*(canNavigate?1:0.18))):0);},
    onSwipeEnd:(dx,dy,vx)=>{if(Math.abs(dx)>Math.abs(dy)&&(Math.abs(dx)>80||Math.abs(dx)>24&&Math.abs(vx)>500))settlePage(dx>0?1:-1);else if(dy>100&&Math.abs(dx)<80)close();else settlePage(0);},
    onCancelSwipe:()=>pageX.setValue(0),
  });
  const {update,transform}=zoom;
  const settlePage=(direction: -1|0|1)=>{
    if(paging.current || closing.current)return;
    const navigate=direction>0?navigation.current.onPrevious:direction<0?navigation.current.onNext:undefined;
    const target=navigate?direction:0;
    setOriginal(false);
    if(reducedMotion.current){pageX.setValue(0);if(navigate){update(1);navigate();}return;}
    paging.current=true;
    Animated.timing(pageX,{toValue:target*viewport.current.width,duration:target?220:180,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start(({finished})=>{
      if(finished && !closing.current && navigate){
        pendingPage.current=setTimeout(()=>{paging.current=false;pageX.setValue(0);},600);
        update(1);navigate();
        return;
      }
      paging.current=false;pageX.setValue(0);
    });
  };
  useLayoutEffect(()=>{
    pageX.stopAnimation();pageX.setValue(0);
    clearTimeout(pendingPage.current);
    paging.current=false;
  },[uri,imageKey,pageX]);
  useEffect(()=>{closing.current=false;return()=>{closing.current=true;clearTimeout(pendingPage.current);pageX.stopAnimation();};},[pageX]);
  const close = () => {
    if(closing.current)return;
    closing.current=true;setOriginal(false);
    pageX.stopAnimation();
    if(reducedMotion.current){closeHandler.current();return;}
    Animated.timing(transition,{toValue:0,duration:180,easing:Easing.in(Easing.cubic),useNativeDriver:true}).start(({finished})=>{if(finished)closeHandler.current();});
  };
  useEffect(() => { setOriginal(false); update(1); }, [uri]);
  const { scale, x, y } = transform;
  // Stable URI keys retain decoded neighbor views as they become the current page.
  const pages=Array.from(new Set([previousUri,uri,nextUri].filter((value):value is string=>Boolean(value))));
  return <Modal visible={Boolean(uri)} transparent statusBarTranslucent animationType="none" onRequestClose={close} onShow={() => { setShown(true); update(1);setOriginal(false); const target = findNodeHandle(closeRef.current); if (target) AccessibilityInfo.setAccessibilityFocus(target); }}>
    <GestureHandlerRootView style={{flex:1}}><Animated.View testID="image-preview-transition" style={{flex:1,opacity:transition,backgroundColor:'#0c1013'}} accessibilityViewIsModal>
      {uri?<StatusBar barStyle="light-content" backgroundColor="#0c1013"/>:null}
      <SafeAreaView style={{flex:1}}>
        <View style={{height:52,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:12}}>
          <View style={{flex:1}}><Text numberOfLines={1} style={{color:'#fff',fontSize:15,fontWeight:'600'}}>{original && comparison?comparison.label:title||'图片预览'}</Text><Text style={{color:'#aab3bb',fontSize:11,marginTop:2}}>双指缩放 · 放大后拖动 · 原比例下滑关闭</Text></View>
          {scale>1?<ImageOverlayAction label="还原图片缩放" icon="refresh" onPress={()=>update(1)} dark/>:null}
          <View ref={closeRef}><ImageOverlayAction label="关闭图片预览" icon="close" onPress={close} dark/></View>
        </View>
        <Animated.View style={{flex:1,minHeight:0,transform:[{scale:transition.interpolate({inputRange:[0,1],outputRange:[0.96,1]})}]}}>
          <GestureDetector gesture={zoom.gesture}><View collapsable={false} accessible accessibilityLabel="图片画廊" accessibilityActions={[
            ...(onPrevious?[{name:'decrement' as const,label:'上一张'}]:[]),
            ...(onNext?[{name:'increment' as const,label:'下一张'}]:[]),
          ]} onAccessibilityAction={event=>{if(event.nativeEvent.actionName==='increment')settlePage(-1);else if(event.nativeEvent.actionName==='decrement')settlePage(1);}}
            onLayout={event => { viewport.current = event.nativeEvent.layout; zoom.onLayout(event); }} style={{flex:1,overflow:'hidden'}}>
            <Animated.View pointerEvents="none" testID="image-page-track" style={{width:'100%',height:'100%',transform:[{translateX:pageX}]}}>
              {pages.map(page=>{
                const active=page===uri;
                return <Image key={page} fadeDuration={0} accessible={false}
                  testID={active?'reference-image-preview':'image-page-neighbor'}
                  source={{uri:active && original && comparison?comparison.uri:page}} resizeMode="contain"
                  style={{position:'absolute',left:active?'0%':page===previousUri?'-100%':'100%',width:'100%',height:'100%',transform:active?[{translateX:x},{translateY:y},{scale}]:[]}}/>;
              })}
            </Animated.View>
          </View></GestureDetector>
          {comparison?<View style={{position:'absolute',right:16,bottom:16}}><HoldToCompare active={original} onChange={setOriginal}/></View>:null}
        </Animated.View>

      </SafeAreaView>
    </Animated.View>
  </GestureHandlerRootView></Modal>;
}
