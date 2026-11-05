import {useState} from 'react';
import {Keyboard} from 'react-native';
import {useRouter} from 'expo-router';
import {TaskInboxButton} from '../tasks/TaskInboxButton';
import {IconAction,ParameterSheet,SettingRow} from './WorkbenchUI';
export function AssistantActions({onOpenSkills,threadId,beforeNavigate}:{onOpenSkills?:()=>void;threadId?:string;beforeNavigate?:(proceed:()=>void)=>void}={}){
 const go=(proceed:()=>void)=>beforeNavigate?beforeNavigate(proceed):proceed();
 const [open,setOpen]=useState(false),router=useRouter();
 return <><TaskInboxButton/><IconAction label="助手菜单" icon="more_horiz" onPress={()=>{Keyboard.dismiss();setOpen(true);}}/>{open?<ParameterSheet title="助手菜单" onClose={()=>setOpen(false)}><SettingRow label="技能管理" value="导入、启用或停用技能" onPress={()=>{setOpen(false);if(onOpenSkills)onOpenSkills();else router.push('/agent-skills');}}/><SettingRow label={threadId?'会话运行历史':'运行历史'} value={threadId?'此会话已保存的运行':'查看全部已保存运行'} onPress={()=>{setOpen(false);go(()=>router.push({pathname:'/agent-skills',params:{intent:'history',threadId}}));}}/><SettingRow label="助手设置" onPress={()=>{setOpen(false);go(()=>router.push({pathname:'/settings-panel',params:{section:'assistant'}}));}}/></ParameterSheet>:null}</>;
}
