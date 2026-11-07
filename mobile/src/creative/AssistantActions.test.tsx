import React from 'react';
import {act,create} from 'react-test-renderer';
import {AssistantActions} from './AssistantActions';
import {IconAction,SettingRow} from './WorkbenchUI';
const mockPush=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('../tasks/TaskInboxButton',()=>({TaskInboxButton:()=>null}));
test('conversation history and settings wait for the active skill editor leave decision',()=>{
 const guard=jest.fn(),openSkills=jest.fn();let tree!:ReturnType<typeof create>;try{act(()=>{tree=create(<AssistantActions threadId="original" beforeNavigate={guard} onOpenSkills={openSkills}/>);});
 const open=()=>act(()=>tree.root.findByType(IconAction).props.onPress());open();act(()=>tree.root.findAllByType(SettingRow).find(n=>n.props.label==='会话技能运行记录')!.props.onPress());expect(mockPush).not.toHaveBeenCalled();act(()=>guard.mock.calls[0][0]());expect(mockPush).toHaveBeenLastCalledWith({pathname:'/agent-skills',params:{intent:'history',threadId:'original'}});
 open();act(()=>tree.root.findAllByType(SettingRow).find(n=>n.props.label==='助手设置')!.props.onPress());expect(guard).toHaveBeenCalledTimes(2);
 open();act(()=>tree.root.findAllByType(SettingRow).find(n=>n.props.label==='技能管理')!.props.onPress());expect(openSkills).toHaveBeenCalledTimes(1);
 }finally{act(()=>tree.unmount());}
});
