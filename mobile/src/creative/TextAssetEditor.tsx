import {useRef,useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {saveCreativeText} from './fileImport';
import {ListAction} from '../ui/ListPageUI';
import {COLORS} from '../ui/theme';
export function TextAssetEditor({projectId,onSaved}:{projectId?:string;onSaved:()=>Promise<unknown>}){
  const lock=useRef(false);
  const [open,setOpen]=useState(false),[title,setTitle]=useState(''),[content,setContent]=useState(''),[kind,setKind]=useState<'prompt'|'document'>('prompt'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <View style={{gap:8}}><ListAction label={open?'收起文本素材':'新建 Prompt 或设定文档'} secondary disabled={busy} onPress={()=>setOpen(!open)}/>
    {open?<><Text style={{color:COLORS.textMuted}}>文本作为独立资产保存，可加入项目、保留版本并导出。不会提交生成。</Text>
      <ListAction label={kind==='prompt'?'类型：Prompt（切换为设定文档）':'类型：设定文档（切换为 Prompt）'} secondary disabled={busy} onPress={()=>setKind(kind==='prompt'?'document':'prompt')}/>
      <TextInput accessibilityLabel="文本资产名称" placeholder="名称" value={title} onChangeText={setTitle} editable={!busy} style={{color:COLORS.text,borderWidth:1,borderColor:COLORS.border,padding:12}}/>
      <TextInput accessibilityLabel="文本资产内容" placeholder="Prompt、角色设定、场景说明……" multiline value={content} onChangeText={setContent} editable={!busy} style={{color:COLORS.text,borderWidth:1,borderColor:COLORS.border,padding:12,minHeight:160}}/>
      <ListAction label="保存文本资产" disabled={busy||!title.trim()||!content} onPress={()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');void saveCreativeText({title,kind,content,projectId}).then(async()=>{setTitle('');setContent('');await onSaved();}).catch(e=>setError(e.message)).finally(()=>{lock.current=false;setBusy(false);});}}/>
      {error?<Text accessibilityRole="alert" style={{color:COLORS.danger}}>{error}</Text>:null}
    </>:null}
  </View>;
}
