import React from 'react';
import { act, create } from 'react-test-renderer';
import { AgentCreativeCards } from './AgentCreativeCards';
import { ImagePreview } from '../ui/ImagePreview';
import { readAgentCreativeActivity, type AgentCreativeActivity } from './agentCreativeActivity';
import type { AssetVersion } from './types';

const mockPush=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush}),useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback])}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:async()=>({project_id:'project'})})}));
jest.mock('./accountRuntime',()=>({creativeAccounts:jest.fn(),creativeBudget:()=>({availableUnknownRequests:async()=>0})}));
jest.mock('./agentCreativeActivity',()=>({...jest.requireActual('./agentCreativeActivity'),readAgentCreativeActivity:jest.fn()}));
jest.mock('expo-file-system/legacy',()=>({documentDirectory:'file:///documents/'}));
jest.mock('./MediaPreview',()=>({MediaPreview:()=>null}));
jest.mock('../ui/icons',()=>({AppIcon:()=>null}));
jest.mock('../ui/ImagePreview',()=>({ImagePreview:()=>null}));
jest.mock('./WorkbenchUI',()=>({ParameterSheet:({children}: {children:React.ReactNode})=><>{children}</>}));

const read=readAgentCreativeActivity as jest.MockedFunction<typeof readAgentCreativeActivity>;
const button=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(node=>node.props.accessibilityLabel===label && typeof node.props.onPress==='function')[0];
const output:AssetVersion={id:'output',assetId:'asset',versionNo:1,source:'generated',relativePath:'cas/result.png',mime:'image/png',state:'AVAILABLE',recipe:{}};
const draft={id:'draft',project_id:'project',shot_id:null,target_asset_id:'asset',provider_id:'novelai',workflow_id:'image',input_json:'{"prompt":"tennis"}',revision:1,state:'SUBMITTED',job_id:'job'};

beforeEach(()=>{jest.useFakeTimers();jest.clearAllMocks();});
afterEach(()=>{jest.useRealTimers();});

test('polls the actual job and lets the user open its archived original image or task details',async()=>{
  let rows:AgentCreativeActivity[]=[{id:'draft',name:'图片创作',draft,jobId:'job',status:'QUEUED',outputs:[]}];
  read.mockImplementation(async()=>rows);
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<AgentCreativeCards threadId="thread" running={false}/>);});
    expect(tree.root.findByProps({testID:'agent-creative-summary'}).props.accessibilityLabel).toContain('排队中');
    rows=[{...rows[0],status:'SUCCEEDED',outputs:[output]}];
    await act(async()=>{jest.advanceTimersByTime(2500);});
    expect(tree.root.findByProps({testID:'agent-creative-summary'}).props.accessibilityLabel).toContain('1 个成果可查看');
    act(()=>tree.root.findByProps({testID:'agent-creative-summary'}).props.onPress());
    act(()=>button(tree,'查看生成成果 1').props.onPress());
    expect(tree.root.findByType(ImagePreview).props.uri).toBe('file:///documents/cas/result.png');
    act(()=>tree.root.findByType(ImagePreview).props.onClose());
    act(()=>button(tree,'查看生成任务详情').props.onPress());
    expect(mockPush).toHaveBeenCalledWith({pathname:'/creative-task/[id]',params:{id:'job'}});
    await act(async()=>tree.update(<AgentCreativeCards threadId="another-thread" running={false}/>));
    expect(tree.root.findByType(ImagePreview).props.uri).toBeNull();
    expect(button(tree,'查看生成成果 1')).toBeUndefined();
  }finally{act(()=>tree?.unmount());}
});

test('reports failed reads instead of claiming no generation and recovers on the next poll',async()=>{
  read.mockRejectedValueOnce(new Error('db busy')).mockResolvedValue([]);
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<AgentCreativeCards threadId="thread" running={false}/>);});
    expect(tree.root.findByProps({testID:'agent-creative-summary'}).props.accessibilityLabel).toContain('读取失败');
    await act(async()=>{jest.advanceTimersByTime(2500);});
    expect(tree.root.findByProps({testID:'agent-creative-summary'}).props.accessibilityLabel).toContain('尚无生成任务');
  }finally{act(()=>tree?.unmount());}
});
