import React from 'react';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo, Animated, Modal, PanResponder, View } from 'react-native';
import { ImagePreview } from './ImagePreview';

test('paging follows the finger, commits only after sliding, and springs back at the boundary',async()=>{
  jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false);
  const pan=jest.spyOn(PanResponder,'create');
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
    const handlers=pan.mock.calls.at(-1)![0];
    const offset=()=>tree.root.findByProps({testID:'image-page-track'}).props.style.transform[0].translateX.__getValue();
    act(()=>handlers.onPanResponderGrant!(event(100),gesture(0)));
    act(()=>handlers.onPanResponderMove!(event(220),gesture(120)));
    expect(offset()).toBe(120);
    act(()=>handlers.onPanResponderRelease!(event(220),gesture(120)));
    expect(previous).not.toHaveBeenCalled();
    expect(steps.at(-1)?.config).toMatchObject({toValue:360,useNativeDriver:true});
    act(()=>steps.at(-1)?.finish?.({finished:true}));
    expect(previous).not.toHaveBeenCalled();
    act(()=>tree.root.findByProps({testID:'page-handoff'}).props.onLoad());
    expect(previous).toHaveBeenCalledTimes(1);
    act(()=>tree.update(<ImagePreview uri="file:///old.png" onClose={()=>undefined}/>));
    act(()=>tree.root.findByProps({testID:'reference-image-preview'}).props.onLoad());
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,80));});
    act(()=>handlers.onPanResponderGrant!(event(220),gesture(0)));
    act(()=>handlers.onPanResponderMove!(event(100),gesture(-120)));
    expect(offset()).toBeCloseTo(-21.6);
    act(()=>handlers.onPanResponderRelease!(event(100),gesture(-120)));
    expect(steps.at(-1)?.config.toValue).toBe(0);
    act(()=>steps.at(-1)?.finish?.({finished:true}));
    expect(previous).toHaveBeenCalledTimes(1);
    const zoom=tree.root.findAll(n=>n.props.accessibilityLabel==='放大'&&n.props.onPress)[0];
    act(()=>zoom.props.onPress());
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

test('pinch-to-pan stays continuous, clamps offsets, and near-unit zoom allows a later downward close', () => {
  const spy = jest.spyOn(PanResponder, 'create');
  const close = jest.fn();
  let tree!: ReturnType<typeof create>;
  try {
    act(() => { tree = create(<ImagePreview uri="file:///image.png" onClose={close} />); });
    const handlers = spy.mock.calls.at(-1)![0];
    const event = (points: number[][]) => ({ nativeEvent: { touches: points.map(([pageX, pageY]) => ({ pageX, pageY })) } }) as never;
    const gesture = (dx = 0, dy = 0) => ({ dx, dy }) as never;
    const transform = () => tree.root.findByProps({ testID: 'reference-image-preview' }).props.style.transform;
    act(() => tree.root.findAllByType(View).find(node => node.props.onLayout)!.props.onLayout({ nativeEvent: { layout: { width: 200, height: 400 } } }));
    act(() => handlers.onPanResponderGrant!(event([[0, 0], [100, 0]]), gesture()));
    act(() => handlers.onPanResponderMove!(event([[0, 0], [200, 0]]), gesture()));
    expect(transform()[2].scale).toBe(2);
    act(() => handlers.onPanResponderMove!(event([[120, 100]]), gesture(120, 100)));
    expect(transform()[0].translateX).toBe(0);
    act(() => handlers.onPanResponderMove!(event([[150, 120]]), gesture(150, 120)));
    expect(transform()[0].translateX).toBe(30);
    expect(transform()[1].translateY).toBe(20);
    act(() => handlers.onPanResponderMove!(event([[1000, 1000]]), gesture()));
    expect(transform()[0].translateX).toBe(100);
    expect(transform()[1].translateY).toBe(200);
    act(() => handlers.onPanResponderRelease!(event([]), gesture()));
    act(() => handlers.onPanResponderGrant!(event([[0, 0], [200, 0]]), gesture()));
    act(() => handlers.onPanResponderMove!(event([[0, 0], [100.001, 0]]), gesture()));
    expect(transform()[2].scale).toBe(1);
    act(() => handlers.onPanResponderRelease!(event([]), gesture(0, 150)));
    expect(close).not.toHaveBeenCalled();
    act(() => handlers.onPanResponderGrant!(event([[0, 0]]), gesture()));
    act(() => handlers.onPanResponderRelease!(event([]), gesture(0, 150)));
    expect(close).toHaveBeenCalledTimes(1);
  } finally { act(() => tree?.unmount()); spy.mockRestore(); }
});

test('original comparison retains the zoomed viewport and adjacent version controls remain available',()=>{
  const previous=jest.fn();let tree!:ReturnType<typeof create>;
  try{
    act(()=>{tree=create(<ImagePreview uri="file:///result.png" title="版本 2" onClose={()=>undefined} onPrevious={previous} comparison={{uri:'file:///original.png',label:'原图 · v1'}} />);});
    const button=(label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label && typeof n.props.onPress==='function')[0];
    act(()=>button('放大').props.onPress());
    const preview=()=>tree.root.findByProps({testID:'reference-image-preview'});
    const transform=preview().props.style.transform;
    act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='按住查看原图' && n.props.onPressIn)[0].props.onPressIn());
    expect(preview().props.source.uri).toBe('file:///original.png');
    expect(preview().props.style.transform).toEqual(transform);
    act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='按住查看原图' && n.props.onPressOut)[0].props.onPressOut());
    expect(preview().props.source.uri).toBe('file:///result.png');
    act(()=>button('上一个版本').props.onPress());expect(previous).toHaveBeenCalledTimes(1);
    act(()=>button('放大').props.onPress());
    act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='按住查看原图' && n.props.onPressIn)[0].props.onPressIn());
    act(()=>tree.update(<ImagePreview uri="file:///other-result.png" title="版本 3" onClose={()=>undefined} comparison={{uri:'file:///other-original.png',label:'原图 · v2'}} />));
    expect(preview().props.source.uri).toBe('file:///other-result.png');
    expect(preview().props.style.transform[2].scale).toBe(1);
  }finally{act(()=>tree?.unmount());}
});
