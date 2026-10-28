import React from 'react';
import {act,create} from 'react-test-renderer';
import {VideoGenerationHistory,videoRoundTimes} from './VideoGenerationHistory';
import {CreativeResults} from './CreativeResults';
const mockStored=new Map<string,string>();
let mockRows:any[]=[],mockJobs:any={},mockVersions:any[]=[],mockReads=0;
jest.mock('expo-secure-store',()=>({getItemAsync:async(k:string)=>mockStored.get(k)??null,setItemAsync:async(k:string,v:string)=>{mockStored.set(k,v);}}));
jest.mock('./runtime',()=>({creativeService:()=>({videoHistory:async()=>{mockReads++;const rounds=mockRows.filter(d=>mockJobs[d.job_id]).map(draft=>({draft,job:{...mockJobs[draft.job_id]},versions:mockVersions.filter(v=>v.recipe.jobId===draft.job_id)}));return {rounds,stamp:JSON.stringify(rounds)};}})}));
jest.mock('./MediaPreview',()=>({MediaPreview:()=>null}));
jest.mock('./CreativeResults',()=>({CreativeResults:()=>null,creativeJobLabel:(s:string)=>s}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
const make=(id:string)=>({id,provider_id:'autodl',project_id:null,shot_id:null,target_asset_id:'asset',job_id:id,workflow_id:'wf',input_json:'{}',state:'SUBMITTED'});
test('old selection survives new results and reopening; unfinished rounds are visible',async()=>{
 jest.useFakeTimers();let tree!:ReturnType<typeof create>;
 mockRows=[make('two'),make('one')];mockJobs={one:{id:'one',status:'SUCCEEDED',created_at:1,started_at:2,execution_duration:2},two:{id:'two',status:'RUNNING',created_at:3,started_at:4,execution_duration:null}};mockVersions=[{id:'v1',assetId:'asset',state:'AVAILABLE',recipe:{jobId:'one'}}];
 const render=()=> <VideoGenerationHistory draft={mockRows[0]} disabled={false} onLatestStatus={()=>{}}/>;
 try{
  await act(async()=>{tree=create(render());});
  expect(tree.root.findByType(CreativeResults).props.draft.job_id).toBe('one');
  await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='查看第 1 轮视频'&&n.props.onPress)[0].props.onPress());
  mockVersions.push({id:'v2',assetId:'asset',state:'AVAILABLE',recipe:{jobId:'two'}});mockJobs.two.status='SUCCEEDED';
  await act(async()=>jest.advanceTimersByTime(2500));
  expect(tree.root.findByType(CreativeResults).props.draft.job_id).toBe('one');
  expect(tree.root.findByType(CreativeResults).props.onlyJob).toBe(true);
  expect(tree.root.findAll(n=>n.props.label==='查看最新一轮').length).toBeGreaterThan(0);
  act(()=>tree.unmount());await act(async()=>{tree=create(render());});
  expect(tree.root.findByType(CreativeResults).props.draft.job_id).toBe('one');
 }finally{act(()=>tree?.unmount());jest.useRealTimers();}
});
test('missing terminal timing is not fabricated and running timing advances',()=>{
 expect(videoRoundTimes({id:'a',status:'FAILED',created_at:0,updated_at:10000,started_at:null,execution_duration:null},12000)).toBe('排队 未记录 · 运行 未记录');
 expect(videoRoundTimes({id:'a',status:'RUNNING',created_at:0,updated_at:10000,started_at:2000,execution_duration:null},12000)).toBe('排队 2秒 · 运行 10秒');
});


test('hidden history suspends reads and completed history stops polling',async()=>{
 jest.useFakeTimers();mockStored.clear();mockReads=0;
 mockRows=[make('one')];mockJobs={one:{id:'one',status:'SUCCEEDED',created_at:1,started_at:2,execution_duration:2}};mockVersions=[{id:'v1',assetId:'asset',state:'AVAILABLE',recipe:{jobId:'one'}}];
 let tree!:ReturnType<typeof create>;
 const render=(visible:boolean)=><VideoGenerationHistory draft={mockRows[0]} disabled={false} visible={visible} onLatestStatus={()=>{}}/>;
 try{
  await act(async()=>{tree=create(render(false));});expect(mockReads).toBe(0);
  await act(async()=>tree.update(render(true)));expect(mockReads).toBe(1);
  await act(async()=>jest.advanceTimersByTime(10000));expect(mockReads).toBe(1);
  await act(async()=>tree.update(render(false)));
  await act(async()=>jest.advanceTimersByTime(10000));expect(mockReads).toBe(1);
  await act(async()=>tree.update(render(true)));expect(mockReads).toBe(2);
 }finally{act(()=>tree?.unmount());jest.useRealTimers();}
});
