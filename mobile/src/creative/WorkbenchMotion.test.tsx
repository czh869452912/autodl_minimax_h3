import React from 'react';
import {act,create} from 'react-test-renderer';
import {AccessibilityInfo,Animated,Text} from 'react-native';
import {WorkbenchMotion,WorkbenchRegion} from './WorkbenchMotion';

afterEach(()=>jest.restoreAllMocks());
test('reduced motion removes closed tools immediately',async()=>{
  jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
  let tree!:ReturnType<typeof create>;
  const render=(visible:boolean)=><WorkbenchMotion><WorkbenchRegion visible={visible} size={240}><Text>工具</Text></WorkbenchRegion></WorkbenchMotion>;
  try{
    await act(async()=>{tree=create(render(true));});
    act(()=>tree.update(render(false)));
    expect(tree.root.findAllByType(Text)).toHaveLength(0);
  }finally{act(()=>tree?.unmount());}
});
test('closing tools are inaccessible and a rapid reopen cancels the outgoing animation',async()=>{
  jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false);
  const animations:Array<{start:jest.Mock;stop:jest.Mock}>=[];
  jest.spyOn(Animated,'timing').mockImplementation(()=>{const animation={start:jest.fn(),stop:jest.fn(),reset:jest.fn()};animations.push(animation);return animation;});
  let tree!:ReturnType<typeof create>;
  const render=(visible:boolean)=><WorkbenchMotion><WorkbenchRegion visible={visible} size={240}><Text>工具</Text></WorkbenchRegion></WorkbenchMotion>;
  try{
    await act(async()=>{tree=create(render(true));});
    act(()=>tree.update(render(false)));
    expect(tree.root.findAll(n=>n.props.importantForAccessibility==='no-hide-descendants').length).toBeGreaterThan(0);
    const closing=animations.at(-1)!;
    act(()=>tree.update(render(true)));
    expect(closing.stop).toHaveBeenCalled();
    expect(tree.root.findAll(n=>n.props.importantForAccessibility==='no-hide-descendants')).toHaveLength(0);
    expect(tree.root.findAllByType(Text)).toHaveLength(1);
  }finally{act(()=>tree?.unmount());}
});
