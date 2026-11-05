import React from 'react';
import {act,create} from 'react-test-renderer';
import {ProjectPlans} from './ProjectPlans';
import {ListAction} from '../ui/ListPageUI';

const mockPush=jest.fn(),mockPrepare=jest.fn(),mockCandidates=jest.fn(),mockDependencies=jest.fn();
let mockState='ACTIVE',mockStepState='BLOCKED',mockJob:string|null=null,mockPaused=false;
const mockDb={getFirstAsync:async(sql:string)=>sql.includes('creative_decision_requests')?{id:'decision',state:'WAITING'}:sql.includes("kind='video'")?{id:'step',state:mockStepState,job_id:mockJob,draft_id:'draft',input_binding_json:JSON.stringify({prompt:'move'}),error_json:null}:sql.includes('creative_plan_controls')&&mockPaused?{plan_id:'plan'}:null,getAllAsync:async()=>[]};
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('./runtime',()=>({creativeService:()=>({shots:async(projectId:string)=>[{id:projectId+'-shot',title:projectId+' shot',description:'move'}],availableVersionPage:(...args:unknown[])=>mockCandidates(...args)}),creativeFiles:()=>({})}));
jest.mock('./planReads',()=>({readPlanPage:async(_:unknown,projectId:string)=>({items:[{id:projectId+'-plan',project_id:projectId,title:projectId+' plan',state:mockState,revision:0}],next:undefined}),readPlanBatchPage:async()=>({items:[],next:undefined}),readDependencyPlanPage:async()=>({items:[]})}));
jest.mock('./planDependencies',()=>({readPlanDependencies:(...args:unknown[])=>mockDependencies(...args)}));
jest.mock('./videoRuntime',()=>({prepareCreativeVideo:(...args:unknown[])=>mockPrepare(...args)}));
jest.mock('./CreativeAccountPanel',()=>({CreativeAccountPanel:()=>null}));
jest.mock('./WorkbenchUI',()=>({ParameterSheet:({children}:{children:React.ReactNode})=><>{children}</>}));
jest.mock('./useLiveRefresh',()=>({useLiveRefresh:(load:Function,_interval:number,identity:string)=>require('react').useEffect(()=>{let live=true;void load(()=>live);return()=>{live=false;};},[identity])}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('expo-file-system/legacy',()=>({documentDirectory:'file:///documents/'}));

let tree:ReturnType<typeof create>;
const button=(label:string)=>tree.root.findAllByType(ListAction).find(node=>node.props.label===label);
const click=async(label:string)=>{await act(async()=>{const node=button(label);expect(node).toBeDefined();expect(node!.props.disabled).toBeFalsy();node!.props.onPress();});};
beforeEach(()=>{mockState='ACTIVE';mockStepState='BLOCKED';mockJob=null;mockPaused=false;jest.clearAllMocks();mockDependencies.mockResolvedValue([]);});
afterEach(()=>act(()=>tree?.unmount()));

test.each([
 ['CANCELLED','CANCELLED',null,true,'计划已取消','查看取消记录'],
 ['QUARANTINED','DISPATCHED','old-job',true,'计划已隔离，需核对旧任务','查看隔离与原任务'],
 ['COMPLETED','SUCCEEDED','job',true,'候选已归档','查看执行与候选'],
 ['ACTIVE','BLOCKED',null,true,'后续已暂停','查看暂停与恢复'],
 ['ACTIVE','FAILED','failed-job',false,'任务未完成','处理失败镜头'],
 ['ACTIVE','DISPATCHED','job',false,'已有生成任务','查看执行与候选'],
 ['ACTIVE','PENDING',null,false,'等待选择参考图','选择参考图'],
] as const)('shows %s / %s before retained decision/job history',async(state,step,job,paused,status,action)=>{
 mockState=state;mockStepState=step;mockJob=job;mockPaused=paused;
 await act(async()=>{tree=create(<ProjectPlans projectId="a"/>);});
 expect(JSON.stringify(tree.toJSON())).toContain(status);expect(button(action)).toBeDefined();
 if(state!=='ACTIVE')expect(button('选择参考图')).toBeUndefined();
 expect(mockPrepare).not.toHaveBeenCalled();
});

test('late image candidates cannot refill another project and the operation lock is released',async()=>{
 let release!:(value:unknown)=>void;
 mockCandidates.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 await act(async()=>{tree=create(<ProjectPlans projectId="a"/>);});
 await click('新建计划');await click('单个镜头');await click('a shot');
 await act(async()=>tree.update(<ProjectPlans projectId="b"/>));
 expect(JSON.stringify(tree.toJSON())).not.toContain('a plan');
 await act(async()=>release({items:[{title:'Old private candidate',version:{id:'old',versionNo:1}}]}));
 await click('新建计划');await click('单个镜头');
 expect(button('Old private candidate · 版本 1')).toBeUndefined();
 expect(button('b shot')?.props.disabled).toBeFalsy();
});

test('workflow recovery opens video configuration without preparing or authorizing a new request',async()=>{
 mockPrepare.mockRejectedValue(new Error('WORKFLOW 工作流未配置'));
 await act(async()=>{tree=create(<ProjectPlans projectId="a"/>);});
 await click('选择参考图');await click('核对生成请求与许可');await click('配置生成工作流');
 expect(mockPush).toHaveBeenCalledWith({pathname:'/creative-capabilities',params:{purpose:'video'}});
 expect(mockPrepare).toHaveBeenCalledTimes(1);
});

test('a project switch during the final dependency read cannot open the old request review',async()=>{
 let release!:(value:unknown)=>void;
 mockPrepare.mockResolvedValue({db:mockDb,draft:{id:'draft',revision:0,input_json:'{}'},account:{credential_generation_id:'credential'},prepared:{},versionIds:[]});
 await act(async()=>{tree=create(<ProjectPlans projectId="a"/>);});
 await click('选择参考图');
 mockDependencies.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 await click('核对生成请求与许可');
 await act(async()=>tree.update(<ProjectPlans projectId="b"/>));
 await act(async()=>release([]));
 expect(JSON.stringify(tree.toJSON())).not.toContain('本次 1 个视频请求');
 expect(button('确认以上 1 个请求的许可')).toBeUndefined();
 expect(button('新建计划')?.props.disabled).toBeFalsy();
});
