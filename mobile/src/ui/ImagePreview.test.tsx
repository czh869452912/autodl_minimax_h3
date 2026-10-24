import React from 'react';
import { act, create } from 'react-test-renderer';
import { PanResponder, View } from 'react-native';
import { ImagePreview } from './ImagePreview';

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
    act(()=>button('对照原图').props.onPress());
    expect(preview().props.source.uri).toBe('file:///original.png');
    expect(preview().props.style.transform).toEqual(transform);
    act(()=>button('查看结果').props.onPress());
    expect(preview().props.source.uri).toBe('file:///result.png');
    act(()=>button('上一个版本').props.onPress());expect(previous).toHaveBeenCalledTimes(1);
    act(()=>button('放大').props.onPress());
    act(()=>button('对照原图').props.onPress());
    act(()=>tree.update(<ImagePreview uri="file:///other-result.png" title="版本 3" onClose={()=>undefined} comparison={{uri:'file:///other-original.png',label:'原图 · v2'}} />));
    expect(preview().props.source.uri).toBe('file:///other-result.png');
    expect(preview().props.style.transform[2].scale).toBe(1);
  }finally{act(()=>tree?.unmount());}
});
