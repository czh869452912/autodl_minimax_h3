import {useRef,useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import type {AssetVersion,CreativeAsset} from './types';
import {readCreativeText} from './textContent';
import {saveCreativeText} from './fileImport';
import {ListAction} from '../ui/ListPageUI';
import {COLORS} from '../ui/theme';
export function TextVersionEditor({asset,version,onSaved}:{asset:CreativeAsset;version:AssetVersion;onSaved:()=>Promise<unknown>}){
  const lock=useRef(false),[content,setContent]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const work=async(fn:()=>Promise<unknown>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{lock.current=false;setBusy(false);}};
  if(asset.kind!=='prompt'&&asset.kind!=='document')return null;
  return <View style={{gap:8}}>
    {content===undefined?<ListAction label="基于此版本编辑文本" secondary disabled={busy} onPress={()=>void work(async()=>setContent(await readCreativeText(version)))}/>:<>
      <Text style={{color:COLORS.textMuted}}>基于版本 {version.versionNo} 保存新的候选版本。默认版本及项目固定版本保持原选择。</Text>
      <TextInput accessibilityLabel="文本新版本内容" multiline editable={!busy} value={content} onChangeText={setContent} style={{color:COLORS.text,borderColor:COLORS.border,borderWidth:1,minHeight:180,padding:12}}/>
      <ListAction label="保存为新版本" disabled={busy||!content} onPress={()=>void work(async()=>{
        await saveCreativeText({assetId:asset.id,expectedRevision:asset.revision,title:asset.title,kind:asset.kind as 'prompt'|'document',content});
        setContent(undefined);await onSaved();
      })}/>
      <ListAction label="放弃本次编辑" secondary disabled={busy} onPress={()=>setContent(undefined)}/>
    </>}
    {error?<Text accessibilityRole="alert" style={{color:COLORS.danger}}>{error}</Text>:null}
  </View>;
}
