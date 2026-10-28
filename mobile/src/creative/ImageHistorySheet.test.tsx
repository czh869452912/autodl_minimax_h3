jest.mock('expo-router',()=>({useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
import React from 'react';
import { act, create } from 'react-test-renderer';
import { ImageHistorySheet, resultImageDetails } from './ImageHistorySheet';
import type { AssetVersion } from './types';
import { Modal } from 'react-native';
jest.mock('./MediaPreview', () => ({ MediaPreview: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
const version: AssetVersion = { id: 'v', assetId: 'a', versionNo: 1, source: 'generated', state: 'AVAILABLE', recipe: { input: { prompt: 'night sky', seed: 12, width: 832, height: 1216 }, output: { seed: 0, width: 1664, height: 2432 } } };
test('history shows actual output size and seed, preserving seed zero', () => {
  expect(resultImageDetails(version)).toEqual({ prompt: 'night sky', seed: 0, width: 1664, height: 2432 });
});
test('search narrows history by prompt or seed and choosing only changes preview', async () => {
  let tree!: ReturnType<typeof create>;
  const select = jest.fn(), close = jest.fn();
  try {
    await act(async () => { tree = create(<ImageHistorySheet versions={[version, { ...version, id: 'v2', versionNo: 2, recipe: { input: { prompt: 'forest', seed: 98 } } }]} locked={false} onLock={jest.fn()} onSelect={select} onClose={close} />); });
    const search = tree.root.findAll(n => n.props.accessibilityLabel === '搜索生成历史' && n.props.onChangeText)[0];
    act(() => search.props.onChangeText('98'));
    expect(tree.root.findAll(n => n.props.accessibilityLabel === '查看版本 1' && n.props.onPress)).toHaveLength(0);
    act(() => tree.root.findAll(n => n.props.accessibilityLabel === '查看版本 2' && n.props.onPress)[0].props.onPress());
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 'v2' })); expect(close).toHaveBeenCalledTimes(1);
  } finally { act(() => tree?.unmount()); }
});
test('batch save selects only available filtered originals and reports queued rather than completed',async()=>{
  let tree!:ReturnType<typeof create>;const save=jest.fn(async()=>undefined);
  const available={...version,relativePath:'v.png'};
  const button=(label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label && n.props.onPress)[0];
  try{
    await act(async()=>{tree=create(<ImageHistorySheet versions={[available,{...version,id:'missing',state:'MISSING'}]} locked={false} onLock={jest.fn()} onSelect={jest.fn()} onClose={jest.fn()} onExport={save}/>);});
    act(()=>button('批量保存').props.onPress());act(()=>button('选择筛选结果').props.onPress());
    await act(async()=>button('保存所选 1 张').props.onPress());
    expect(save).toHaveBeenCalledWith([available]);expect(tree.root.findAll(n=>typeof n.props.children==='string' && n.props.children.includes('已加入保存队列')).length).toBeGreaterThan(0);
  }finally{act(()=>tree?.unmount());}
});
test('inline history keeps browsing open after selection and never mounts a modal',async()=>{
  let tree!:ReturnType<typeof create>;const select=jest.fn(),close=jest.fn();
  try{
    await act(async()=>{tree=create(<ImageHistorySheet inline versions={[version]} locked={false} onLock={jest.fn()} onSelect={select} onClose={close}/>);});
    expect(tree.root.findAllByType(Modal)).toHaveLength(0);
    act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='查看版本 1' && n.props.onPress)[0].props.onPress());
    expect(select).toHaveBeenCalledWith(version);expect(close).not.toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});
