import React from 'react';
import {act,create} from 'react-test-renderer';
import {ListAction} from '../ui/ListPageUI';
const mockPush=jest.fn(),mockRead=jest.fn();let mockFocus:()=>void|(()=>void);
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,back:jest.fn()}),useFocusEffect:(fn:()=>void)=>{mockFocus=fn;require('react').useEffect(fn,[fn]);}}));
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
