import React from 'react';
import {act,create} from 'react-test-renderer';
import {AgentWorkspace} from './AgentWorkspace';
import AgentScreen from '../agent/AgentScreen';
let mockProjectId:string|undefined,mockProjects:any[]=[],mockReadError:Error|undefined,mockAccess=true;
const mockNavigate=jest.fn();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({projectId:mockProjectId}),useRouter:()=>({navigate:mockNavigate}),useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('../agent/AgentScreen',()=>({__esModule:true,default:()=>null}));
jest.mock('./runtime',()=>({creativeService:()=>({projects:async()=>{if(mockReadError)throw mockReadError;return mockProjects;}})}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({})}));
jest.mock('../storage/databaseAccess',()=>({checkDatabaseAccessAsync:async()=>{if(!mockAccess)throw Error('protected');return true;}}));
jest.mock('../agent/LocalHistoryBrowser',()=>({LocalHistoryBrowser:()=>null}));
beforeEach(()=>{mockProjectId=undefined;mockReadError=undefined;mockAccess=true;mockProjects=[{id:'p',title:'Project'}];jest.clearAllMocks();});
test('opens chat directly and project scope changes remount the correct conversation',async()=>{let tree!:ReturnType<typeof create>;try{
 await act(async()=>{tree=create(<AgentWorkspace/>);});expect(tree.root.findByType(AgentScreen).props.projectId).toBe('p');
 expect(JSON.stringify(tree.toJSON())).not.toContain('返回项目选择');mockProjectId='q';act(()=>tree.update(<AgentWorkspace/>));expect(tree.root.findByType(AgentScreen).props.projectId).toBe('q');
 }finally{act(()=>tree?.unmount());}});
test('empty projects link to project management without creating a conversation',async()=>{mockProjects=[];let tree!:ReturnType<typeof create>;try{
 await act(async()=>{tree=create(<AgentWorkspace/>);});expect(tree.root.findAllByType(AgentScreen)).toHaveLength(0);
 act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='前往项目'&&typeof n.props.onPress==='function')[0].props.onPress());expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/projects');
 }finally{act(()=>tree?.unmount());}});

test('read failure preserves explicit scope and retry recovers it without mounting a wrong project',async()=>{
 mockProjectId='original';mockReadError=new TypeError('private diagnostic');let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<AgentWorkspace/>);});
 expect(tree.root.findAllByType(AgentScreen)).toHaveLength(0);
 expect(JSON.stringify(tree.toJSON())).not.toContain('private diagnostic');
 expect(tree.root.findAll(n=>n.props.accessibilityLabel==='查看此项目本地对话').length).toBeGreaterThan(0);
 mockReadError=undefined;await act(async()=>tree.root.findAll(n=>n.props.accessibilityLabel==='重试读取项目'&&typeof n.props.onPress==='function')[0].props.onPress());
 expect(tree.root.findByType(AgentScreen).props.projectId).toBe('original');
 }finally{act(()=>tree?.unmount());}
});

test('protected storage never offers local history',async()=>{
 mockProjectId='original';mockAccess=false;mockReadError=Error('APP_DATABASE_READ_ONLY: recovery');let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<AgentWorkspace/>);});
 expect(tree.root.findAll(n=>n.props.accessibilityLabel==='查看此项目本地对话')).toHaveLength(0);
 act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='前往数据维护'&&typeof n.props.onPress==='function')[0].props.onPress());
 expect(mockNavigate).toHaveBeenCalledWith({pathname:'/settings-panel',params:{section:'storage'}});
 }finally{act(()=>tree?.unmount());}
});
