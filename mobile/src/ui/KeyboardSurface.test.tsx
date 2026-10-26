import React from 'react';
import {act,create} from 'react-test-renderer';
import {Keyboard,ScrollView,StyleSheet,TextInput,View,type KeyboardEvent} from 'react-native';
import {KeyboardSurface,KeyboardAwareScrollView} from './KeyboardSurface';
import type {KeyboardFrame,WindowRect} from './keyboardGeometry';

let metrics:KeyboardFrame|undefined;
const listeners=new Map<string,Set<(event:KeyboardEvent)=>void>>();
const keyboard={screenX:0,screenY:500,width:400,height:300};
const emit=(name:string)=>listeners.get(name)?.forEach(callback=>callback({endCoordinates:keyboard} as KeyboardEvent));
beforeEach(()=>{
  jest.useFakeTimers();metrics=undefined;listeners.clear();
  jest.spyOn(Keyboard,'metrics').mockImplementation(()=>metrics);
  jest.spyOn(Keyboard,'addListener').mockImplementation((name,callback)=>{
    if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(callback);
    return {remove:()=>{listeners.get(name)?.delete(callback);}} as ReturnType<typeof Keyboard.addListener>;
  });
});
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();});
const flush=()=>act(()=>{jest.runOnlyPendingTimers();});

test('measures the full window origin, preserves padding and avoids double-resizing',()=>{
  let rect:WindowRect={x:0,y:80,width:400,height:720},tree!:ReturnType<typeof create>;
  const native={measureInWindow:(callback:(...values:number[])=>void)=>callback(rect.x,rect.y,rect.width,rect.height)};
  try{
    act(()=>{tree=create(<KeyboardSurface testID="surface" style={{flex:1,paddingBottom:12}}/>,{createNodeMock:()=>native});});
    jest.spyOn(tree.root.findByType(View).instance,'measureInWindow').mockImplementation(native.measureInWindow as never);
    metrics=keyboard;act(()=>{emit('keyboardWillShow');emit('keyboardDidShow');});flush();
    expect(StyleSheet.flatten(tree.root.findByType(View).props.style).paddingBottom).toBe(312);
    rect={...rect,height:420};act(()=>tree.root.findByType(View).props.onLayout({nativeEvent:{layout:rect}}));flush();
    expect(StyleSheet.flatten(tree.root.findByType(View).props.style).paddingBottom).toBe(12);
    rect={...rect,height:720};act(()=>tree.root.findByType(View).props.onLayout({nativeEvent:{layout:rect}}));flush();
    expect(StyleSheet.flatten(tree.root.findByType(View).props.style).paddingBottom).toBe(312);
    metrics=undefined;act(()=>emit('keyboardDidHide'));flush();
    expect(StyleSheet.flatten(tree.root.findByType(View).props.style).paddingBottom).toBe(12);
  }finally{act(()=>tree?.unmount());}
});

test('handles a newly mounted modal while the keyboard is open and suspends inactive surfaces',()=>{
  metrics=keyboard;let tree!:ReturnType<typeof create>;
  const native={measureInWindow:(callback:(...values:number[])=>void)=>callback(0,24,400,776)};
  try{
    act(()=>{tree=create(<KeyboardSurface style={{padding:8}}/>);});
    jest.spyOn(tree.root.findByType(View).instance,'measureInWindow').mockImplementation(native.measureInWindow as never);flush();
    expect(StyleSheet.flatten(tree.root.findByType(View).props.style).paddingBottom).toBe(308);
    act(()=>tree.update(<KeyboardSurface enabled={false} style={{padding:8}}/>));flush();
    expect(StyleSheet.flatten(tree.root.findByType(View).props.style).paddingBottom).toBe(8);
  }finally{act(()=>tree?.unmount());}
});

test('reveals a focused descendant when focus changes while the keyboard stays open',()=>{
  metrics=keyboard;
  let fy=700,descendant=true,tree!:ReturnType<typeof create>;
  const focused={measureInWindow:(callback:(...values:number[])=>void)=>callback(16,fy,368,48),measureLayout:(_parent:unknown,success:()=>void,failure:()=>void)=>descendant?success():failure()};
  jest.spyOn(TextInput.State,'currentlyFocusedInput').mockReturnValue(focused as never);
  const native={measureInWindow:(callback:(...values:number[])=>void)=>callback(0,80,400,420)};
  const ref=React.createRef<ScrollView>();
  try{
    act(()=>{tree=create(<KeyboardAwareScrollView ref={ref}/>,{createNodeMock:()=>native});});
    jest.spyOn(ref.current!,'getNativeScrollRef').mockReturnValue(native as never);
    const scroll=jest.spyOn(ref.current!,'scrollTo').mockImplementation(()=>undefined);
    act(()=>tree.root.findByType(ScrollView).props.onFocus({}));flush();
    expect(scroll).toHaveBeenLastCalledWith({y:264,animated:false});
    act(()=>tree.root.findByType(ScrollView).props.onScroll({nativeEvent:{contentOffset:{y:400}}}));
    fy=480;act(()=>tree.root.findByType(ScrollView).props.onFocus({}));flush();
    expect(scroll).toHaveBeenLastCalledWith({y:444,animated:false});
    scroll.mockClear();descendant=false;
    act(()=>tree.root.findByType(ScrollView).props.onFocus({}));flush();
    expect(scroll).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});

test('reveals the native caret rather than the top of an oversized input and keeps IME while scrolling',async()=>{
  metrics=keyboard;let tree!:ReturnType<typeof create>;
  const rn=require('react-native');
  const focused={measureInWindow:(cb:Function)=>cb(16,-400,368,1200),measureLayout:(_parent:unknown,ok:Function)=>ok()};
  jest.spyOn(TextInput.State,'currentlyFocusedInput').mockReturnValue(focused as never);
  jest.spyOn(rn,'findNodeHandle').mockReturnValue(77);
  rn.NativeModules.AutoDLMedia={focusedInputCaret:jest.fn(async()=>({target:77,x:16,y:650,width:1,height:24}))};
  const native={measureInWindow:(cb:Function)=>cb(0,80,400,420)},ref=React.createRef<ScrollView>();
  try{
    act(()=>{tree=create(<KeyboardAwareScrollView ref={ref}/>);});
    jest.spyOn(ref.current!,'getNativeScrollRef').mockReturnValue(native as never);
    const scroll=jest.spyOn(ref.current!,'scrollTo').mockImplementation(()=>undefined);
    const view=tree.root.findByType(ScrollView);
    expect(view.props.keyboardDismissMode).toBe('none');
    act(()=>view.props.onScroll({nativeEvent:{contentOffset:{y:600}}}));
    await act(async()=>{view.props.onFocus({});jest.runOnlyPendingTimers();});
    expect(scroll).toHaveBeenLastCalledWith({y:790,animated:false});
  }finally{act(()=>tree?.unmount());delete rn.NativeModules.AutoDLMedia;}
});
