import React from 'react';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, Animated, Image, Modal, View } from 'react-native';
import {GestureDetector} from 'react-native-gesture-handler';
import { ImagePreview } from './ImagePreview';

test('paging follows the finger, commits only after sliding, and springs back at the boundary',async()=>{
  jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false);

  const steps:Array<{config:any;finish?:({finished}:{finished:boolean})=>void}>=[];
  jest.spyOn(Animated,'timing').mockImplementation((_value,config)=>{
    const step:{config:any;finish?:({finished}:{finished:boolean})=>void}={config};steps.push(step);
    return {start:callback=>{step.finish=callback;},stop:jest.fn(),reset:jest.fn()};
  });
  const previous=jest.fn();let tree!:ReturnType<typeof create>;
  const event=(x:number)=>({nativeEvent:{touches:[{pageX:x,pageY:100}]}}) as never;
  const gesture=(dx:number)=>({dx,dy:0,vx:0}) as never;
  try{
    await act(async()=>{tree=create(<ImagePreview uri="file:///result.png" previousUri="file:///old.png" onPrevious={previous} onClose={()=>undefined}/>);});
    await act(async()=>tree.root.findByType(Modal).props.onShow());
    act(()=>tree.root.findAllByType(View).find(n=>n.props.onLayout)!.props.onLayout({nativeEvent:{layout:{width:360,height:600}}}));
    const retainedNeighbor=tree.root.findByProps({testID:'image-page-neighbor'});
    const native=tree.root.findByType(GestureDetector).props.gesture.gestures[1].handlers;
    const handlers={onPanResponderGrant:(_e:unknown,_g:unknown)=>native.onBegin({}),onPanResponderMove:(_e:unknown,g:any)=>native.onUpdate({translationX:g.dx,translationY:g.dy,numberOfPointers:1}),onPanResponderRelease:(_e:unknown,g:any)=>native.onEnd({translationX:g.dx,translationY:g.dy,velocityX:g.vx},true)};
    const offset=()=>tree.root.findByProps({testID:'image-page-track'}).props.style.transform[0].translateX.__getValue();
    act(()=>handlers.onPanResponderGrant!(event(100),gesture(0)));
    act(()=>handlers.onPanResponderMove!(event(220),gesture(120)));
    expect(offset()).toBe(120);
    act(()=>handlers.onPanResponderRelease!(event(220),gesture(120)));
    expect(previous).not.toHaveBeenCalled();
    expect(steps.at(-1)?.config).toMatchObject({toValue:360,useNativeDriver:true});
    act(()=>steps.at(-1)?.finish?.({finished:true}));
    expect(previous).toHaveBeenCalledTimes(1);
    act(()=>tree.update(<ImagePreview uri="file:///old.png" onClose={()=>undefined}/>));
    expect(tree.root.findAllByProps({testID:'page-handoff'})).toHaveLength(0);
    expect(tree.root.findByProps({testID:'reference-image-preview'})).toBe(retainedNeighbor);
    act(()=>handlers.onPanResponderGrant!(event(220),gesture(0)));
    act(()=>handlers.onPanResponderMove!(event(100),gesture(-120)));
    expect(offset()).toBeCloseTo(-21.6);
    act(()=>handlers.onPanResponderRelease!(event(100),gesture(-120)));
    expect(steps.at(-1)?.config.toValue).toBe(0);
    act(()=>steps.at(-1)?.finish?.({finished:true}));
    expect(previous).toHaveBeenCalledTimes(1);
    const pinch=tree.root.findByType(GestureDetector).props.gesture.gestures[0].handlers;
    act(()=>{pinch.onStart({focalX:180,focalY:300});pinch.onUpdate({scale:2,focalX:180,focalY:300});pinch.onFinalize({},true);});
    const count=steps.length;
    act(()=>handlers.onPanResponderGrant!(event(100),gesture(0)));
    act(()=>handlers.onPanResponderMove!(event(220),gesture(120)));
    act(()=>handlers.onPanResponderRelease!(event(220),gesture(120)));
    expect(steps).toHaveLength(count);
    expect(offset()).toBe(0);
  }finally{act(()=>tree?.unmount());jest.restoreAllMocks();}
});

test('fullscreen animates in and delays unmount until the exit transition completes',async()=>{
  jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false);
  const steps:Array<{config:any;finish?:({finished}:{finished:boolean})=>void}>=[];
  jest.spyOn(Animated,'timing').mockImplementation((_value,config)=>{
    const step:{config:any;finish?:({finished}:{finished:boolean})=>void}={config};steps.push(step);
    return {start:callback=>{step.finish=callback;},stop:jest.fn(),reset:jest.fn()};
  });
  const close=jest.fn();let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImagePreview uri="file:///result.png" onClose={close}/>);});
    expect(steps).toHaveLength(0);
    await act(async()=>tree.root.findByType(Modal).props.onShow());
    expect(steps.at(-1)?.config).toMatchObject({toValue:1,useNativeDriver:true});
    act(()=>tree.root.findByType(Modal).props.onRequestClose());
    expect(steps.at(-1)?.config).toMatchObject({toValue:0,useNativeDriver:true});
    expect(close).not.toHaveBeenCalled();
    const count=steps.length;
    act(()=>tree.root.findByType(Modal).props.onRequestClose());
    expect(steps).toHaveLength(count);
    act(()=>steps.at(-1)?.finish?.({finished:true}));
    expect(close).toHaveBeenCalledTimes(1);
  }finally{act(()=>tree?.unmount());jest.restoreAllMocks();}
});

test('native pinch preserves focal point and remaining-finger pan never pages or closes',()=>{
  const close=jest.fn(),previous=jest.fn();let tree!:ReturnType<typeof create>;
  try{
    act(()=>{tree=create(<ImagePreview uri="file:///image.png" onClose={close} onPrevious={previous}/>);});
    act(()=>tree.root.findAllByType(View).find(n=>n.props.onLayout)!.props.onLayout({nativeEvent:{layout:{width:200,height:400}}}));
    const [pinch,pan]=tree.root.findByType(GestureDetector).props.gesture.gestures.map((g:any)=>g.handlers);
    const transform=()=>tree.root.findByProps({testID:'reference-image-preview'}).props.style.transform;
    act(()=>{pan.onBegin({});pinch.onStart({focalX:100,focalY:200});pinch.onUpdate({scale:2,focalX:100,focalY:200});});
    expect(transform()[2].scale).toBe(2);
    act(()=>{pinch.onFinalize({},true);pan.onUpdate({translationX:100,translationY:100,numberOfPointers:1});pan.onUpdate({translationX:130,translationY:120,numberOfPointers:1});});
    expect(transform()[0].translateX).toBe(30);expect(transform()[1].translateY).toBe(20);
    act(()=>pan.onEnd({translationX:130,translationY:120,velocityX:800},true));
    expect(previous).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
    act(()=>{pinch.onStart({focalX:100,focalY:200});pinch.onUpdate({scale:0.5,focalX:100,focalY:200});pinch.onFinalize({},true);});
    expect(transform()[2].scale).toBe(1);
    act(()=>pan.onEnd({translationX:0,translationY:150,velocityX:0},true));expect(close).not.toHaveBeenCalled();
    act(()=>{pan.onBegin({});pan.onEnd({translationX:0,translationY:150,velocityX:0},true);});expect(close).toHaveBeenCalledTimes(1);
  }finally{act(()=>tree?.unmount());}
});

test('original comparison retains the zoomed viewport and adjacent version controls remain available',()=>{
  const previous=jest.fn();let tree!:ReturnType<typeof create>;
  try{
    act(()=>{tree=create(<ImagePreview uri="file:///result.png" title="版本 2" onClose={()=>undefined} onPrevious={previous} comparison={{uri:'file:///original.png',label:'原图 · v1'}} />);});
    const pinch=tree.root.findByType(GestureDetector).props.gesture.gestures[0].handlers;
    const magnify=()=>{pinch.onStart({focalX:0,focalY:0});pinch.onUpdate({scale:2,focalX:0,focalY:0});pinch.onFinalize({},true);};
    act(magnify);
    const preview=()=>tree.root.findByProps({testID:'reference-image-preview'});
    const transform=preview().props.style.transform;
    act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='按住查看原图' && n.props.onPressIn)[0].props.onPressIn());
    expect(preview().props.source.uri).toBe('file:///original.png');
    expect(preview().props.style.transform).toEqual(transform);
    act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='按住查看原图' && n.props.onPressOut)[0].props.onPressOut());
    expect(preview().props.source.uri).toBe('file:///result.png');
    act(()=>tree.root.findByProps({accessibilityLabel:'图片画廊'}).props.onAccessibilityAction({nativeEvent:{actionName:'decrement'}}));expect(previous).toHaveBeenCalledTimes(1);
    act(magnify);
    act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='按住查看原图' && n.props.onPressIn)[0].props.onPressIn());
    act(()=>tree.update(<ImagePreview uri="file:///other-result.png" title="版本 3" onClose={()=>undefined} comparison={{uri:'file:///other-original.png',label:'原图 · v2'}} />));
    expect(preview().props.source.uri).toBe('file:///other-result.png');
    expect(preview().props.style.transform[2].scale).toBe(1);
  }finally{act(()=>tree?.unmount());}
});


test('gallery keeps only three pages and shows reset only while zoomed',()=>{
  let tree!:ReturnType<typeof create>;
  try{
    act(()=>{tree=create(<ImagePreview uri="file:///b.png" previousUri="file:///a.png" nextUri="file:///c.png" onClose={()=>undefined}/>);});
    const controls=(label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label && n.props.onPress);
    for(const label of ['放大','缩小','上一个版本','下一个版本','还原图片缩放'])expect(controls(label)).toHaveLength(0);
    expect(tree.root.findAllByType(Image).filter(n=>n.props.testID==='image-page-neighbor')).toHaveLength(2);
    const pinch=tree.root.findByType(GestureDetector).props.gesture.gestures[0].handlers;
    act(()=>{pinch.onStart({focalX:0,focalY:0});pinch.onUpdate({scale:2,focalX:0,focalY:0});pinch.onFinalize({},true);});
    expect(controls('还原图片缩放').length).toBeGreaterThan(0);
    act(()=>controls('还原图片缩放')[0].props.onPress());
    expect(controls('还原图片缩放')).toHaveLength(0);
    act(()=>tree.update(<ImagePreview uri="file:///c.png" previousUri="file:///b.png" nextUri="file:///d.png" onClose={()=>undefined}/>));
    expect(tree.root.findAllByType(Image).filter(n=>n.props.testID==='image-page-neighbor')).toHaveLength(2);
    expect(tree.root.findAll(n=>n.props.source?.uri==='file:///a.png')).toHaveLength(0);
  }finally{act(()=>tree?.unmount());}
});
