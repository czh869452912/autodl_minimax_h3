import React from 'react';
import {act,create} from 'react-test-renderer';
import {StyleSheet,Text} from 'react-native';
import {ImageEditorDrawer,drawerStops,nearestDrawerStop} from './ImageEditorDrawer';
test('drawer is an absolute overlay with collapsed, middle and upper snaps',async()=>{
  expect(drawerStops(600)).toEqual([60,420,592]);expect(nearestDrawerStop(600,410)).toBe(1);expect(nearestDrawerStop(600,570)).toBe(2);expect(nearestDrawerStop(600,120,1)).toBe(0);
  let tree!:ReturnType<typeof create>;const open=jest.fn(),close=jest.fn();
  try{await act(async()=>{tree=create(<ImageEditorDrawer expanded height={600} summary={<Text>summary</Text>} onExpand={open} onCollapse={close}><Text>editor</Text></ImageEditorDrawer>);});
    expect(StyleSheet.flatten(tree.root.findAllByProps({testID:'image-workbench-tools'})[0].props.style)).toMatchObject({position:'absolute',bottom:0});
    act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='拖动编辑抽屉'&&n.props.onAccessibilityAction)[0].props.onAccessibilityAction({nativeEvent:{actionName:'decrement'}}));expect(close).toHaveBeenCalledTimes(1);
  }finally{act(()=>tree?.unmount());}
});
