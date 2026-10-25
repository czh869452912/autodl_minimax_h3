import React,{forwardRef,useCallback,useEffect,useRef,useState} from 'react';
import {Keyboard,Platform,ScrollView,StyleSheet,TextInput,View,type KeyboardEvent,type ScrollViewProps,type ViewProps} from 'react-native';
import {keyboardOverlap,focusedInputScrollOffset,type KeyboardFrame} from './keyboardGeometry';

/** Avoid the actual window intersection, without guessing status bar or ancestor header heights. */
export function KeyboardSurface({enabled=true,style,onLayout,...props}:ViewProps & {enabled?:boolean}) {
  const view=useRef<View>(null),frame=useRef<KeyboardFrame|undefined>(Keyboard.metrics()),epoch=useRef(0),raf=useRef<number|undefined>(undefined);
  const [bottom,setBottom]=useState(0);
  const measure=useCallback(()=>{
    const version=++epoch.current;
    if(!enabled || !frame.current){setBottom(0);return;}
    view.current?.measureInWindow((x,y,width,height)=>{
      if(version!==epoch.current)return;
      setBottom(keyboardOverlap({x,y,width,height},frame.current));
    });
  },[enabled]);
  const schedule=useCallback(()=>{
    if(raf.current!==undefined)cancelAnimationFrame(raf.current);
    raf.current=requestAnimationFrame(()=>{raf.current=undefined;measure();});
  },[measure]);
  useEffect(()=>{
    frame.current=Keyboard.metrics();schedule();
    const show=(event:KeyboardEvent)=>{frame.current=event.endCoordinates;schedule();};
    const hide=()=>{frame.current=undefined;++epoch.current;setBottom(0);};
    const subscriptions=[Keyboard.addListener(Platform.OS==='ios'?'keyboardWillShow':'keyboardDidShow',show),Keyboard.addListener('keyboardDidHide',hide)];
    if(Platform.OS==='ios')subscriptions.push(Keyboard.addListener('keyboardWillChangeFrame',show));
    return ()=>{subscriptions.forEach(subscription=>subscription.remove());++epoch.current;if(raf.current!==undefined)cancelAnimationFrame(raf.current);};
  },[schedule]);
  const base=StyleSheet.flatten(style),padding=base?.paddingBottom??base?.paddingVertical??base?.padding;
  return <View {...props} ref={view} collapsable={false} style={[style,{paddingBottom:(typeof padding==='number'?padding:0)+(enabled?bottom:0)}]} onLayout={event=>{onLayout?.(event);schedule();}}/>;
}

/** Reveal focused descendants on focus changes, viewport changes and IME transitions. */
export const KeyboardAwareScrollView=forwardRef<ScrollView,ScrollViewProps>(function KeyboardAwareScrollView({onFocus,onLayout,onScroll,onContentSizeChange,...props},forwardedRef){
  const scroll=useRef<ScrollView|null>(null),offset=useRef(0),raf=useRef<number|undefined>(undefined),epoch=useRef(0);
  const reveal=useCallback(()=>{
    const focused=TextInput.State.currentlyFocusedInput(),target=scroll.current,version=++epoch.current;
    const keyboard=Keyboard.metrics();
    const native=target?.getNativeScrollRef();
    if(!focused || !target || !native || !keyboard || props.horizontal)return;
    native.measureInWindow((x,y,width,height)=>focused.measureInWindow((fx,fy,fw,fh)=>{
      if(version!==epoch.current || scroll.current!==target || focused!==TextInput.State.currentlyFocusedInput())return;
      // Only scroll descendants of this scroll view; another modal may own the focused field.
      focused.measureLayout(native,()=>{
        if(version!==epoch.current || focused!==TextInput.State.currentlyFocusedInput())return;
        const next=focusedInputScrollOffset({x,y,width,height},{x:fx,y:fy,width:fw,height:fh},offset.current,keyboard);
        if(Math.abs(next-offset.current)>1){offset.current=next;target.scrollTo({y:next,animated:false});}
      },()=>undefined);
    }));
  },[props.horizontal]);
  const schedule=useCallback(()=>{
    if(raf.current!==undefined)cancelAnimationFrame(raf.current);
    raf.current=requestAnimationFrame(()=>{raf.current=undefined;reveal();});
  },[reveal]);
  useEffect(()=>{
    const subscriptions=[Keyboard.addListener('keyboardDidShow',schedule),Keyboard.addListener('keyboardDidChangeFrame',schedule)];
    return ()=>{subscriptions.forEach(subscription=>subscription.remove());++epoch.current;if(raf.current!==undefined)cancelAnimationFrame(raf.current);};
  },[schedule]);
  return <ScrollView {...props} ref={node=>{scroll.current=node;if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node;}} keyboardShouldPersistTaps={props.keyboardShouldPersistTaps??'handled'} keyboardDismissMode={props.keyboardDismissMode??'on-drag'} scrollEventThrottle={props.scrollEventThrottle??16} automaticallyAdjustKeyboardInsets={false}
    onFocus={event=>{onFocus?.(event);schedule();}} onLayout={event=>{onLayout?.(event);schedule();}} onContentSizeChange={(width,height)=>{onContentSizeChange?.(width,height);schedule();}}
    onScroll={event=>{offset.current=event.nativeEvent.contentOffset.y;onScroll?.(event);}}/>;
});

export type KeyboardAwareScrollView = ScrollView;
