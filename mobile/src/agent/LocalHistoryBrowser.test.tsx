import React from 'react';
import {act,create} from 'react-test-renderer';
import {LocalHistoryBrowser} from './LocalHistoryBrowser';
import {HistoryList} from './HistoryList';
import {ParameterSheet} from '../creative/WorkbenchUI';
import {ListAction} from '../ui/ListPageUI';
const mockList=jest.fn(),mockLoad=jest.fn(),mockScope=jest.fn();
jest.mock('../storage/databaseClient',()=>({getDatabase:()=>({getFirstAsync:mockScope})}));
jest.mock('./threadStore',()=>({createLocalThreadStore:()=>({listSummaries:mockList,load:mockLoad})}));
jest.mock('./HistoryList',()=>({HistoryList:()=>null}));
jest.mock('./ReadOnlyMessage',()=>({ReadOnlyMessage:({message}:any)=>require('react').createElement(require('react-native').Text,{},message.content)}));
beforeEach(()=>{mockList.mockReset();mockLoad.mockReset();mockScope.mockReset().mockResolvedValue({project_id:'project'});});
const row=(id:string)=>({threadId:id,customTitle:id,messages:[{id:'m',role:'user',content:'saved message '+id}],state:{},createdAt:1,updatedAt:1});
test('reads project-scoped local history and returns to its retained list without a runtime',async()=>{
 const close=jest.fn();mockList.mockResolvedValue([row('a')]);mockLoad.mockResolvedValue(row('a'));let tree!:ReturnType<typeof create>;try{await act(async()=>{tree=create(<LocalHistoryBrowser projectId="project" onClose={close}/>);});
 await act(async()=>tree.root.findByType(HistoryList).props.onSearchHistory('needle'));expect(mockList).toHaveBeenLastCalledWith({projectId:'project',query:'needle',offset:0,limit:50});expect(tree.root.findByType(HistoryList).props.readOnly).toBe(true);
 await act(async()=>tree.root.findByType(HistoryList).props.onSelect('a'));expect(JSON.stringify(tree.toJSON())).toContain('saved message a');expect(mockScope).toHaveBeenCalled();
 act(()=>tree.root.findAllByType(ListAction).find(n=>n.props.label==='返回本地对话列表')!.props.onPress());expect(close).not.toHaveBeenCalled();expect(tree.root.findByType(HistoryList).props.threads[0].threadId).toBe('a');
 act(()=>tree.root.findByType(ParameterSheet).props.onClose());expect(close).toHaveBeenCalledTimes(1);
 }finally{act(()=>tree.unmount());}
});
test('scope drift, deleted messages and late reads cannot display another local conversation',async()=>{
 mockList.mockResolvedValue([row('a')]);let tree!:ReturnType<typeof create>,release!:(value:any)=>void;try{await act(async()=>{tree=create(<LocalHistoryBrowser projectId="project" onClose={jest.fn()}/>);});
 mockScope.mockResolvedValueOnce({project_id:'other'});await act(async()=>tree.root.findByType(HistoryList).props.onSelect('a'));expect(mockLoad).not.toHaveBeenCalled();expect(JSON.stringify(tree.toJSON())).toContain('已不属于当前项目');
 mockLoad.mockResolvedValueOnce(null);await act(async()=>tree.root.findByType(HistoryList).props.onSelect('a'));expect(JSON.stringify(tree.toJSON())).toContain('已删除或不可用');
 mockLoad.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));await act(async()=>tree.root.findByType(HistoryList).props.onSelect('a'));act(()=>tree.root.findByType(ParameterSheet).props.onClose());await act(async()=>release(row('a')));expect(JSON.stringify(tree.toJSON())).not.toContain('saved message a');
 }finally{act(()=>tree.unmount());}
});
test('late search cannot replace a newer project query and empty page stops further reads',async()=>{
 let release!:(value:any)=>void;mockList.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));let tree!:ReturnType<typeof create>;try{await act(async()=>{tree=create(<LocalHistoryBrowser projectId="project" onClose={jest.fn()}/>);});
 let pending!:Promise<void>;act(()=>{pending=tree.root.findByType(HistoryList).props.onSearchHistory('old');});mockList.mockResolvedValueOnce([row('new')]);await act(async()=>tree.root.findByType(HistoryList).props.onSearchHistory('new'));await act(async()=>{release([row('old')]);await pending;});expect(tree.root.findByType(HistoryList).props.threads[0].threadId).toBe('new');
 mockList.mockClear();await act(async()=>tree.root.findByType(HistoryList).props.onLoadMoreHistory());expect(mockList).not.toHaveBeenCalled();
 }finally{act(()=>tree.unmount());}
});
