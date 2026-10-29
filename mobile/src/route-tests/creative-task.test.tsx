import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, Text } from 'react-native';

let mockProvider='novelai',mockReviewed=false;
const mockAcknowledge=jest.fn(async()=>{mockReviewed=true;});
const mockBack=jest.fn();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({id:'original',returnToWorkbench:'1'}),useRouter:()=>({back:mockBack,canGoBack:()=>true}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:async()=>({id:'draft',provider_id:mockProvider,target_asset_id:'asset',job_id:'original'})})}));
jest.mock('../jobs/repository',()=>({createJobRepository:()=>({get:async()=>({id:'original',status:'UNKNOWN',adapterId:mockProvider==='novelai'?'novelai-image':'autodl-comfyui',inputSnapshot:{prompt:'scene'},createdAt:1})})}));
jest.mock('../creative/taskRecovery',()=>({unknownTaskReviewed:async()=>mockReviewed,acknowledgeUnknownTask:(...args:unknown[])=>(mockAcknowledge as any)(...args)}));
jest.mock('../creative/CreativeResults',()=>({CreativeResults:()=>null,creativeJobLabel:(status:string)=>status}));
jest.mock('../tasks/taskServices',()=>({getTaskServices:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View}));
import CreativeTask from '../../app/creative-task/[id]';
import { CreativeResults } from '../creative/CreativeResults';

test.each(['novelai','autodl'])('%s unknown task exposes provider-specific review and returns to the existing canvas',async provider=>{
  mockProvider=provider;mockReviewed=false;jest.clearAllMocks();
  const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>undefined);
  let tree!:ReturnType<typeof create>;
  const button=(label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];
  try{
    await act(async()=>{tree=create(<CreativeTask/>);});
    expect(tree.root.findByType(CreativeResults).props.onlyJob).toBe(true);
    expect(tree.root.findByType(CreativeResults).props.draft.job_id).toBe('original');
    expect(button('打开这次创作与完整历史')).toBeDefined();
    expect(button(`打开 ${provider==='novelai'?'NovelAI':'AutoDL'} 核查`)).toBeDefined();
    if(provider==='novelai')expect(tree.root.findAllByType(Text).map(n=>n.props.children).join('')).not.toContain('AutoDL');
    if(provider==='novelai'){act(()=>button('已核查，解除本次等待').props.onPress());
    expect(mockAcknowledge).not.toHaveBeenCalled();
    await act(async()=>alert.mock.calls[0][2]!.find(action=>action.text==='已核查，继续创作')!.onPress!());
    expect(mockAcknowledge).toHaveBeenCalledWith(expect.anything(),'original');}else{expect(mockAcknowledge).not.toHaveBeenCalled();expect(JSON.stringify(tree.toJSON())).toContain('可返回工作台继续提交新视频');}
    expect(button('已核查，解除本次等待')).toBeUndefined();
    act(()=>button('返回').props.onPress());
    expect(mockBack).toHaveBeenCalledTimes(1);
  }finally{act(()=>tree?.unmount());jest.restoreAllMocks();}
});
