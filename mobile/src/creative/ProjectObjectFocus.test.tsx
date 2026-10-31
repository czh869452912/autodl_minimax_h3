import {AppState} from 'react-native';
beforeEach(()=>{Object.defineProperty(AppState,'currentState',{value:'active',configurable:true});});
import React from 'react';
import {act,create} from 'react-test-renderer';
import {ProjectActivity} from './ProjectActivityPanel';
import {ProjectPlans} from './ProjectPlans';
const mockQuery=jest.fn(),mockFirst=jest.fn();
jest.mock('expo-router',()=>({useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn]),useRouter:()=>({push:jest.fn()})}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getAllAsync:mockQuery,getFirstAsync:mockFirst})}));
jest.mock('./projectActivity',()=>({readProjectActivity:async()=>[]}));
jest.mock('./runtime',()=>({creativeService:()=>({shots:async()=>[]})}));
jest.mock('./accountRuntime',()=>({creativeAccounts:()=>({}),creativeBudget:()=>({})}));
jest.mock('../tasks/executorEvents',()=>({executorEvents:{subscribe:()=>()=>{}},executorWakePort:{signal:jest.fn()}}));
beforeEach(()=>{jest.clearAllMocks();mockQuery.mockResolvedValue([]);mockFirst.mockResolvedValue(null);});
test('proposal focus reads the exact ID beyond the waiting page and ignores a delayed prior target',async()=>{
 let release!:(rows:any[])=>void;mockQuery.mockImplementationOnce(()=>new Promise(r=>{release=r;}));
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<ProjectActivity projectId="p" initialProposalId="a"/>);});
  mockQuery.mockResolvedValue([{id:'b',state:'APPLIED',before_json:'{"title":"before B"}',payload_json:'{"title":"after B"}'}]);
  await act(async()=>tree.update(<ProjectActivity projectId="p" initialProposalId="b"/>));
  await act(async()=>release([{id:'a',state:'WAITING',before_json:'{"title":"before A"}',payload_json:'{}'}]));
  expect(JSON.stringify(tree.toJSON())).toContain('before B');expect(JSON.stringify(tree.toJSON())).not.toContain('before A');
  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('OR id=?'),'p','b','b');
  expect(tree.root.findAll(n=>n.props.accessibilityLabel==='采用这项修改'&&n.props.disabled===true).length).toBeGreaterThan(0);
 }finally{act(()=>tree?.unmount());}
});
test('plan focus queries project and plan identity before pagination',async()=>{
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<ProjectPlans projectId="p" initialPlanId="old-plan"/>);});
  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('OR id=?'),'p','old-plan','old-plan');
  expect(JSON.stringify(tree.toJSON())).toContain('指定计划已不可用');
 }finally{act(()=>tree?.unmount());}
});
