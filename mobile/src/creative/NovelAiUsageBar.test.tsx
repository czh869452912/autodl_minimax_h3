import React from 'react';
import { act, create } from 'react-test-renderer';
import { NovelAiUsageBar } from './NovelAiUsageBar';
import { parseNovelAiUsage } from './novelAiUsage';
const mockList=jest.fn(), mockFetch=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('./accountRuntime',()=>({creativeAccounts:()=>({list:mockList,resolveExact:async(id:string)=>({token:'test-token',generationId:id})})}));
jest.mock('./novelAiUsage',()=>({...jest.requireActual('./novelAiUsage'),fetchNovelAiUsage:(...args:any[])=>mockFetch(...args)}));
beforeEach(()=>{jest.clearAllMocks();mockList.mockResolvedValue([{provider_id:'novelai',credential_generation_id:'g1'}]);mockFetch.mockResolvedValue(parseNovelAiUsage({active:true,tier:3,trainingStepsLeft:{fixedTrainingStepsLeft:100,purchasedTrainingSteps:20},usage:{percent:100,isNegative:false}}));});
const button=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label && n.props.onPress)[0];
test('refresh failure retains the previous value and marks it stale instead of zero',async()=>{
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<NovelAiUsageBar refreshKey="job"/>);});
    expect(JSON.stringify(tree.toJSON())).toContain('120 Anlas');
    mockFetch.mockRejectedValueOnce(new Error('network'));
    await act(async()=>button(tree,'刷新 NovelAI 用量').props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('120 Anlas');expect(JSON.stringify(tree.toJSON())).toContain('待刷新');
    await act(async()=>tree.update(<NovelAiUsageBar refreshKey="job:SUCCEEDED"/>));
    expect(mockFetch).toHaveBeenCalledTimes(3);expect(JSON.stringify(tree.toJSON())).not.toContain('待刷新');
  }finally{act(()=>tree?.unmount());}
});
test('disconnect clears balances and does not query with the retired account',async()=>{
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<NovelAiUsageBar refreshKey="job"/>);});
    mockList.mockResolvedValue([]);
    await act(async()=>button(tree,'刷新 NovelAI 用量').props.onPress());
    expect(JSON.stringify(tree.toJSON())).not.toContain('120 Anlas');expect(JSON.stringify(tree.toJSON())).toContain('连接 NovelAI');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  }finally{act(()=>tree?.unmount());}
});
test('late response from a previous refresh cannot overwrite new account usage',async()=>{
  let release!:(value:any)=>void,tree!:ReturnType<typeof create>;
  mockFetch.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  try{
    await act(async()=>{tree=create(<NovelAiUsageBar refreshKey="old"/>);});
    mockList.mockResolvedValue([{provider_id:'novelai',credential_generation_id:'g2'}]);
    await act(async()=>tree.update(<NovelAiUsageBar refreshKey="new"/>));
    await act(async()=>release(parseNovelAiUsage({active:true,tier:3,trainingStepsLeft:{fixedTrainingStepsLeft:999,purchasedTrainingSteps:0}})));
    expect(JSON.stringify(tree.toJSON())).toContain('120 Anlas');expect(JSON.stringify(tree.toJSON())).not.toContain('999 Anlas');
  }finally{act(()=>tree?.unmount());}
});
