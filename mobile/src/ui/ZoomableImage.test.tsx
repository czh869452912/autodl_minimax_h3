import React from 'react';
import {act,create} from 'react-test-renderer';
import {View} from 'react-native';
import {GestureDetector} from 'react-native-gesture-handler';
import {ZoomableImage} from './ZoomableImage';

test('inline native pinch supports focal zoom, drag, comparison and reset on version change',()=>{
  const open=jest.fn();let tree!:ReturnType<typeof create>;
  const render=(identity='one',showOriginal=false)=><ZoomableImage identity={identity} uri="file:///result.png" originalUri="file:///original.png" showOriginal={showOriginal} label="test image" onOpen={open}/>;
  try{
    act(()=>{tree=create(render());});
    act(()=>tree.root.findAllByType(View).find(n=>n.props.onLayout)!.props.onLayout({nativeEvent:{layout:{width:300,height:400}}}));
    const [pinch,pan]=tree.root.findByType(GestureDetector).props.gesture.gestures.map((g:any)=>g.handlers);
    const transform=()=>tree.root.findAllByType(View).find(n=>n.props.pointerEvents==='none')!.props.style.transform;
    act(()=>{pan.onBegin({});pinch.onStart({focalX:200,focalY:200});pinch.onUpdate({scale:2,focalX:200,focalY:200});});
    expect(transform()).toEqual([{translateX:-50},{translateY:0},{scale:2}]);
    act(()=>{pinch.onFinalize({},true);pan.onUpdate({translationX:0,translationY:0,numberOfPointers:1});pan.onUpdate({translationX:900,translationY:900,numberOfPointers:1});});
    expect(transform()).toEqual([{translateX:150},{translateY:200},{scale:2}]);
    act(()=>tree.update(render('one',true)));
    expect(transform()[2].scale).toBe(2);
    expect(tree.root.findByProps({testID:'result-original-overlay'}).props.style.opacity).toBe(1);
    expect(open).not.toHaveBeenCalled();
    act(()=>tree.update(render('two')));
    expect(transform()).toEqual([{translateX:0},{translateY:0},{scale:1}]);
  }finally{act(()=>tree?.unmount());}
});
