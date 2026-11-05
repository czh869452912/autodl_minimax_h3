import {AppState} from 'react-native';
beforeEach(()=>{Object.defineProperty(AppState,'currentState',{value:'active',configurable:true});});
import React from 'react';
import {act,create} from 'react-test-renderer';
import {ProjectActivity} from './ProjectActivityPanel';
import {ProjectPlans} from './ProjectPlans';
const mockQuery=jest.fn(),mockFirst=jest.fn(),mockAvailable=jest.fn(),mockExecute=jest.fn();let mockShots:any[]=[];
const mockDb={getAllAsync:mockQuery,getFirstAsync:mockFirst};
jest.mock('expo-router',()=>({useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn]),useRouter:()=>({push:jest.fn()})}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('./projectActivity',()=>({readProjectActivity:async()=>[]}));
jest.mock('./runtime',()=>({creativeService:()=>({shots:async()=>mockShots,availableVersionPage:mockAvailable,execute:mockExecute})}));
jest.mock('./accountRuntime',()=>({creativeAccounts:()=>({}),creativeBudget:()=>({})}));
jest.mock('../tasks/executorEvents',()=>({executorEvents:{subscribe:()=>()=>{}},executorWakePort:{signal:jest.fn()}}));
beforeEach(()=>{jest.clearAllMocks();mockShots=[];mockAvailable.mockResolvedValue({items:[]});mockQuery.mockResolvedValue([]);mockFirst.mockResolvedValue(null);});
test('proposal focus reads the exact ID beyond the waiting page and ignores a delayed prior target',async()=>{
 let release!:(rows:any[])=>void;mockQuery.mockImplementationOnce(()=>new Promise(r=>{release=r;}));
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<ProjectActivity projectId="p" initialProposalId="a"/>);});
  mockQuery.mockResolvedValue([{id:'b',command_name:'project.update',state:'APPLIED',project_id:'p',before_json:'{"title":"before B"}',payload_json:'{"title":"after B"}'}]);
  await act(async()=>tree.update(<ProjectActivity projectId="p" initialProposalId="b"/>));
  await act(async()=>release([{id:'a',command_name:'project.update',state:'WAITING',project_id:'p',before_json:'{"title":"before A"}',payload_json:'{}'}]));
  expect(JSON.stringify(tree.toJSON())).toContain('before B');expect(JSON.stringify(tree.toJSON())).not.toContain('before A');
  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('OR id=?'),'p','b','b');
  expect(tree.root.findAll(n=>n.props.accessibilityLabel==='采用这项修改')).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('这份修改已采用');
 }finally{act(()=>tree?.unmount());}
});
test('plan focus queries project and plan identity before pagination',async()=>{
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<ProjectPlans projectId="p" initialPlanId="old-plan"/>);});
  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('OR p.id=?'),'p','old-plan','old-plan',null,null,'all','all','all',null,null,null,null);
  expect(JSON.stringify(tree.toJSON())).toContain('指定计划已不可用');
 }finally{act(()=>tree?.unmount());}
});

const click=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0].props.onPress();
test('plan list opens one detail and candidate preview does not resolve or authorize',async()=>{
 const plan={id:'plan',project_id:'p',shot_id:'s',title:'Shot plan',state:'ACTIVE',revision:0,created_at:1};
 mockQuery.mockImplementation(async(sql:string)=>sql.includes('SELECT p.* FROM creative_plans p')?[plan]:sql.includes('SELECT c.version_id')?[{version_id:'fixed-version',title:'Reference'}]:[]);
 mockFirst.mockImplementation(async(sql:string)=>sql.includes('creative_decision_requests')?{id:'decision',state:'WAITING',revision:0}:sql.includes("kind='video'")?{id:'step',state:'PENDING',input_binding_json:'{"prompt":"move"}',revision:0}:null);
 let tree!:ReturnType<typeof create>;try{await act(async()=>{tree=create(<ProjectPlans projectId="p"/>);});
 expect(JSON.stringify(tree.toJSON())).not.toContain('增加生成前本地检查');
 await act(async()=>click(tree,'选择参考图'));
 await act(async()=>click(tree,'选择 · Reference · -version'));
 expect(mockExecute).not.toHaveBeenCalled();expect(JSON.stringify(tree.toJSON())).toContain('确认选图，之后再核对生成许可');
 }finally{act(()=>tree.unmount());}
});
test('selecting a shot automatically reads candidates without creating a plan or generation',async()=>{
 mockShots=[{id:'s',title:'Lighthouse',description:'Slow push',revision:0}];mockAvailable.mockResolvedValue({items:[{title:'Reference',version:{id:'fixed',versionNo:3}}]});
 let tree!:ReturnType<typeof create>;try{await act(async()=>{tree=create(<ProjectPlans projectId="p"/>);});
 await act(async()=>click(tree,'新建计划'));await act(async()=>click(tree,'单个镜头'));await act(async()=>click(tree,'Lighthouse'));
 expect(mockAvailable).toHaveBeenCalledWith({kind:'image',projectId:'p'});expect(JSON.stringify(tree.toJSON())).toContain('Reference · 版本 3');expect(mockExecute).not.toHaveBeenCalled();
 }finally{act(()=>tree.unmount());}
});
