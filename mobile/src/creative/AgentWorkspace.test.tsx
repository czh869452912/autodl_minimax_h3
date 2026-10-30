import React from 'react';
import {act,create} from 'react-test-renderer';
import {AgentWorkspace} from './AgentWorkspace';
import AgentScreen from '../agent/AgentScreen';
let mockProjectId:string|undefined,mockProjects:any[]=[];
const mockNavigate=jest.fn();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({projectId:mockProjectId}),useRouter:()=>({navigate:mockNavigate}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('../agent/AgentScreen',()=>({__esModule:true,default:()=>null}));
jest.mock('./runtime',()=>({creativeService:()=>({projects:async()=>mockProjects})}));
beforeEach(()=>{mockProjectId=undefined;mockProjects=[{id:'p',title:'Project'}];jest.clearAllMocks();});
test('opens chat directly and project scope changes remount the correct conversation',async()=>{let tree!:ReturnType<typeof create>;try{
 await act(async()=>{tree=create(<AgentWorkspace/>);});expect(tree.root.findByType(AgentScreen).props.projectId).toBe('p');
 expect(JSON.stringify(tree.toJSON())).not.toContain('返回项目选择');mockProjectId='q';act(()=>tree.update(<AgentWorkspace/>));expect(tree.root.findByType(AgentScreen).props.projectId).toBe('q');
 }finally{act(()=>tree?.unmount());}});
test('empty projects link to project management without creating a conversation',async()=>{mockProjects=[];let tree!:ReturnType<typeof create>;try{
 await act(async()=>{tree=create(<AgentWorkspace/>);});expect(tree.root.findAllByType(AgentScreen)).toHaveLength(0);
 act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='前往项目'&&typeof n.props.onPress==='function')[0].props.onPress());expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/projects');
 }finally{act(()=>tree?.unmount());}});
