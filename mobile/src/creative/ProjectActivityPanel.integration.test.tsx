import React from 'react';
import {act,create} from 'react-test-renderer';
import {AppState} from 'react-native';
import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createCreativeService} from './service';
import {ProjectActivity} from './ProjectActivityPanel';
import {ListAction} from '../ui/ListPageUI';
import {ProposalReviewCard} from './ProposalReviewCard';
import {readAgentCreativeActivity} from './agentCreativeActivity';

let mockDb:ReturnType<typeof createInitializedRealSqliteTestDb>;
let mockService:ReturnType<typeof createCreativeService>;
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>mockDb}));
jest.mock('./runtime',()=>({creativeService:()=>mockService}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()}),useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback])}));
jest.mock('../ui/icons',()=>({AppIcon:()=>null}));
let tree:ReturnType<typeof create>;
beforeEach(()=>{jest.useFakeTimers();Object.defineProperty(AppState,'currentState',{value:'active',configurable:true});mockDb=createInitializedRealSqliteTestDb();mockService=createCreativeService(mockDb as never);});
afterEach(()=>{if(tree)act(()=>tree.unmount());mockDb.close();jest.useRealTimers();jest.restoreAllMocks();});
async function fixture(){
  const project=await mockService.execute({name:'project.create',payload:{title:'灯塔短片',brief:'原简报'}},'project');
  if(project.status!=='completed')throw Error('project');
  const projectId=project.value.projectId;
  mockDb.runSync("INSERT INTO agent_runs VALUES('thread','run',0,'{\"status\":\"running\"}')");
  mockDb.runSync("INSERT INTO creative_agent_scopes VALUES('thread',?,0,1)",projectId);
  const result=await mockService.execute({name:'project.update',payload:{id:projectId,expectedRevision:0,title:'灯塔短片',brief:'建议简报'}},'proposal',{threadId:'thread',runId:'run',toolCallId:'update',projectId,scopeRevision:0});
  if(result.status!=='completed')throw Error('proposal');
  return {projectId,proposalId:result.value.proposalId};
}
const click=async(label:string)=>{await act(async()=>tree.root.findAllByType(ListAction).find(n=>n.props.label===label)!.props.onPress());};
const json=()=>JSON.stringify(tree.toJSON());

test('review shows only changes; adoption records its actual terminal state without generating or granting',async()=>{
  const f=await fixture();await act(async()=>{tree=create(<ProjectActivity projectId={f.projectId} initialProposalId={f.proposalId}/>);});
  expect(json()).toContain('项目：灯塔短片');expect(json()).toContain('修改 1 项：简报');
  expect(json()).not.toContain('名称 · 原内容');
  const execute=jest.spyOn(mockService,'execute');
  await act(async()=>{const save=tree.root.findAllByType(ListAction).find(n=>n.props.label==='采用这项修改')!.props.onPress;save();save();});
  expect(execute).toHaveBeenCalledTimes(1);
  expect((await mockService.project(f.projectId))?.brief).toBe('建议简报');
  expect(json()).toContain('已采用');expect(json()).toContain('未提交生成');
  expect(tree.root.findAllByType(ListAction).some(n=>n.props.label==='采用这项修改')).toBe(false);
  const saved=mockDb.getFirstSync<{state:string;resolved_at:number}>('SELECT state,resolved_at FROM creative_change_proposals')!;
  expect(saved.state).toBe('APPLIED');expect(saved.resolved_at).toBeGreaterThan(0);
  expect((await readAgentCreativeActivity(mockDb as never,'thread'))[0].proposal).toMatchObject({id:f.proposalId,state:'APPLIED',resolved_at:saved.resolved_at});
  expect(mockDb.getFirstSync<{n:number}>('SELECT COUNT(*) AS n FROM workflow_jobs')!.n).toBe(0);
});

test('current revision conflict keeps original, current and suggested content and permits rejection',async()=>{
  const f=await fixture();await mockService.execute({name:'project.update',payload:{id:f.projectId,expectedRevision:0,title:'灯塔短片',brief:'用户新简报'}},'human');
  await act(async()=>{tree=create(<ProjectActivity projectId={f.projectId} initialProposalId={f.proposalId}/>);});
  for(const text of ['原简报','用户新简报','建议简报','原内容已有新修订'])expect(json()).toContain(text);
  expect(tree.root.findAllByType(ListAction).some(n=>n.props.label==='采用这项修改')).toBe(false);
  await click('拒绝建议');expect(json()).toContain('已拒绝');expect((await mockService.project(f.projectId))?.brief).toBe('用户新简报');
});

test('a new edit after review is transactionally rejected and the refreshed comparison preserves both versions',async()=>{
  const f=await fixture();await act(async()=>{tree=create(<ProjectActivity projectId={f.projectId} initialProposalId={f.proposalId}/>);});
  await mockService.execute({name:'project.update',payload:{id:f.projectId,expectedRevision:0,title:'灯塔短片',brief:'迟到的新内容'}},'late-human');
  await click('采用这项修改');expect(json()).toContain('迟到的新内容');expect(json()).toContain('未覆盖当前内容');
  expect(mockDb.getFirstSync('SELECT state FROM creative_change_proposals')).toEqual({state:'WAITING'});
});

test('the list keeps the just-resolved card and a different project cannot resolve the original proposal',async()=>{
  const f=await fixture();await act(async()=>{tree=create(<ProjectActivity projectId={f.projectId}/>);});
  expect(tree.root.findByType(ProposalReviewCard).props.expanded).toBe(false);
  await click('审阅修改');await click('拒绝建议');expect(json()).toContain('已拒绝');
  const other=await mockService.execute({name:'project.create',payload:{title:'另一项目'}},'other');if(other.status!=='completed')throw Error('other');
  await act(async()=>tree.update(<ProjectActivity projectId={other.value.projectId} initialProposalId={f.proposalId}/>));
  expect(json()).toContain('指定建议已不可用');expect(tree.root.findAllByType(ProposalReviewCard)).toHaveLength(0);
});
