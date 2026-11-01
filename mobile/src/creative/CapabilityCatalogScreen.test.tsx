import {BackHandler} from 'react-native';
import React from 'react';
import {act,create} from 'react-test-renderer';
import {ListAction} from '../ui/ListPageUI';
const mockBack=jest.fn(),mockReplace=jest.fn();let mockCanGoBack=true;
const mockPush=jest.fn(),mockRead=jest.fn();let mockFocus:()=>void|(()=>void);
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,back:mockBack,replace:mockReplace,canGoBack:()=>mockCanGoBack}),useFocusEffect:(fn:()=>void)=>{mockFocus=fn;require('react').useEffect(fn,[fn]);}}));
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({})}));
jest.mock('./capabilityCatalog',()=>({readCapabilityCatalog:(...args:unknown[])=>mockRead(...args)}));
import {CapabilityCatalogScreen} from './CapabilityCatalogScreen';
test('account gap links to accounts and re-entering the screen refreshes diagnostics',async()=>{
 const item={id:'h3',title:'H3',provider:'autodl',version:'1',outputs:['video'],models:[],configuration:'workflow',reasons:['ACCOUNT_NOT_BOUND']};mockRead.mockResolvedValue({items:[item]});let tree!:ReturnType<typeof create>;
 await act(async()=>{tree=create(<CapabilityCatalogScreen/>);});
 act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='连接生成账号')!.props.onPress());expect(mockPush).toHaveBeenLastCalledWith({pathname:'/settings-panel',params:{section:'accounts'}});
 mockRead.mockResolvedValue({items:[{...item,reasons:[]}]});let cleanup:void|(()=>void);await act(async()=>{cleanup=mockFocus();});
 expect(mockRead).toHaveBeenCalledTimes(2);expect(tree.root.findAllByType(ListAction).some(n=>n.props.label==='连接生成账号')).toBe(false);act(()=>{if(cleanup)cleanup();tree.unmount();});
});


test.each([true,false])('header returns to source or workspace when history=%s',async(hasHistory)=>{
 mockCanGoBack=hasHistory;mockBack.mockClear();mockReplace.mockClear();mockRead.mockResolvedValue({items:[]});let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<CapabilityCatalogScreen/>);});
 act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='返回来源')!.props.onPress());
 if(hasHistory)expect(mockBack).toHaveBeenCalledTimes(1);else expect(mockReplace).toHaveBeenCalledWith('/(tabs)/projects');
 }finally{act(()=>tree.unmount());}
});

test('system Back handles cold links but delegates normal stacks',async()=>{
 let handler:()=>boolean=()=>false;const sub=jest.spyOn(BackHandler,'addEventListener').mockImplementation((_name,fn)=>{handler=fn as ()=>boolean;return {remove:jest.fn()};});
 mockCanGoBack=false;mockReplace.mockClear();mockRead.mockResolvedValue({items:[]});let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<CapabilityCatalogScreen/>);});expect(handler()).toBe(true);expect(mockReplace).toHaveBeenCalledWith('/(tabs)/projects');mockCanGoBack=true;expect(handler()).toBe(false);}finally{act(()=>tree.unmount());sub.mockRestore();}
});
