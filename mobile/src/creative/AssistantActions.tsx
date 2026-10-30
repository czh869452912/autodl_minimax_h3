import {useState} from 'react';
import {Keyboard} from 'react-native';
import {useRouter} from 'expo-router';
import {TaskInboxButton} from '../tasks/TaskInboxButton';
import {IconAction,ParameterSheet,SettingRow} from './WorkbenchUI';
export function AssistantActions(){
 const [open,setOpen]=useState(false),router=useRouter();
 return <><TaskInboxButton/><IconAction label="助手菜单" icon="more_horiz" onPress={()=>{Keyboard.dismiss();setOpen(true);}}/>{open?<ParameterSheet title="助手菜单" onClose={()=>setOpen(false)}><SettingRow label="技能管理" value="导入、启用或停用技能" onPress={()=>{setOpen(false);router.push('/agent-skills');}}/><SettingRow label="助手设置" onPress={()=>{setOpen(false);router.push({pathname:'/settings-panel',params:{section:'assistant'}});}}/></ParameterSheet>:null}</>;
}
