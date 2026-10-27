import {useEffect,useMemo,useRef,useState} from 'react';
import type {LayoutChangeEvent} from 'react-native';
import {Gesture} from 'react-native-gesture-handler';

type Transform={scale:number;x:number;y:number};
type Options={identity:string;blocked?:()=>boolean;onSwipeMove?:(x:number,y:number)=>void;onSwipeEnd?:(x:number,y:number,velocity:number)=>void;onCancelSwipe?:()=>void};
export function clampImageTransform(scale:number,x:number,y:number,width:number,height:number):Transform {
  scale=Math.max(1,Math.min(4,scale));if(scale<1.01)scale=1;
  return {scale,x:Math.max(-width*(scale-1)/2,Math.min(width*(scale-1)/2,x)),y:Math.max(-height*(scale-1)/2,Math.min(height*(scale-1)/2,y))};
}

/** Native recognition owns the full touch sequence, including adding/removing a second finger. */
export function useImageGestures(options:Options){
  const live=useRef(options);live.current=options;
  const [transform,setTransform]=useState<Transform>({scale:1,x:0,y:0});
  const current=useRef(transform),size=useRef({width:0,height:0});
  const update=(scale:number,x=0,y=0)=>{const next=clampImageTransform(scale,x,y,size.current.width,size.current.height);current.current=next;setTransform(next);};
  useEffect(()=>{update(1);},[options.identity]);
  const session=useRef({pinching:false,hadPinch:false,panX:0,panY:0,panReady:false,anchor:{scale:1,x:0,y:0,fx:0,fy:0}});
  const gesture=useMemo(()=>{
    const pinch=Gesture.Pinch().runOnJS(true).onStart(e=>{
      if(live.current.blocked?.())return;
      session.current.pinching=true;session.current.hadPinch=true;live.current.onCancelSwipe?.();
      session.current.anchor={...current.current,fx:e.focalX-size.current.width/2,fy:e.focalY-size.current.height/2};
    }).onUpdate(e=>{
      if(!session.current.pinching||live.current.blocked?.())return;
      const scale=Math.max(1,Math.min(4,session.current.anchor.scale*e.scale)),ratio=scale/session.current.anchor.scale;
      update(scale,e.focalX-size.current.width/2-(session.current.anchor.fx-session.current.anchor.x)*ratio,e.focalY-size.current.height/2-(session.current.anchor.fy-session.current.anchor.y)*ratio);
    }).onFinalize(()=>{session.current.pinching=false;session.current.panReady=false;});
    const pan=Gesture.Pan().minDistance(4).averageTouches(true).runOnJS(true)
      .onBegin(()=>{session.current.hadPinch=false;session.current.panReady=false;})
      .onUpdate(e=>{
        if(live.current.blocked?.())return;
        if(session.current.pinching||e.numberOfPointers>1){session.current.hadPinch=true;session.current.panReady=false;return;}
        if(current.current.scale>1){
          if(session.current.panReady)update(current.current.scale,current.current.x+e.translationX-session.current.panX,current.current.y+e.translationY-session.current.panY);
          session.current.panX=e.translationX;session.current.panY=e.translationY;session.current.panReady=true;
        }else if(!session.current.hadPinch)live.current.onSwipeMove?.(e.translationX,e.translationY);
      }).onEnd(e=>{if(!live.current.blocked?.()&&!session.current.hadPinch&&current.current.scale===1)live.current.onSwipeEnd?.(e.translationX,e.translationY,e.velocityX);})
      .onFinalize((_e,success)=>{session.current.panReady=false;if(!success)live.current.onCancelSwipe?.();});
    return Gesture.Simultaneous(pinch,pan);
  },[]);
  const onLayout=(event:LayoutChangeEvent)=>{size.current=event.nativeEvent.layout;update(current.current.scale,current.current.x,current.current.y);};
  return {gesture,transform,current,update,onLayout};
}
