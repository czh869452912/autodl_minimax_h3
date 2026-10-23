import {compareRecipeFields} from './recipeDiff';
import {useState} from 'react';
import {Image,Text,View} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type {AssetVersion} from './types';
import {ListAction} from '../ui/ListPageUI';
import {COLORS} from '../ui/theme';
import {TextVersionPreview} from './TextVersionPreview';
const recipe=(v:AssetVersion)=>v.recipe.input??v.recipe.inputSnapshot??{prompt:v.recipe.prompt??null,jobId:v.recipe.jobId??null};
const recipeText=(v:AssetVersion)=>JSON.stringify(recipe(v),null,2);
export function VersionComparison({versions}:{versions:AssetVersion[]}){
  const [selected,setSelected]=useState<string[]>([]);
  if(versions.length<2)return null;
  const pair=selected.map(id=>versions.find(v=>v.id===id)).filter((v):v is AssetVersion=>Boolean(v));
  const diff=pair.length===2?compareRecipeFields(recipe(pair[0]),recipe(pair[1])):null;
  return <View style={{gap:10,borderWidth:1,borderColor:COLORS.border,padding:12,borderRadius:12}}>
    <Text style={{color:COLORS.text,fontWeight:'700'}}>比较两个版本</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{versions.map(v=><ListAction key={v.id} label={`${selected.includes(v.id)?'✓ ':''}版本 ${v.versionNo}`} secondary onPress={()=>setSelected(previous=>previous.includes(v.id)?previous.filter(id=>id!==v.id):[...previous.slice(-1),v.id])}/>)}</View>
    {pair.length===2?<><Text style={{color:COLORS.textMuted}}>{pair[0].blobSha256&&pair[0].blobSha256===pair[1].blobSha256?'两个版本的原始文件内容相同。':'两个版本的文件内容不同或尚不可用。'}比较不改变默认版本、项目固定版本或镜头成果。</Text>
      {diff?.rows.map(row=><View key={row.path} style={{borderLeftWidth:3,borderLeftColor:COLORS.danger,paddingLeft:10,gap:4}}><Text style={{color:COLORS.text,fontWeight:'700'}}>{row.path}</Text><Text selectable style={{color:COLORS.textMuted}}>版本 {pair[0].versionNo}：{row.before}</Text><Text selectable style={{color:COLORS.text}}>版本 {pair[1].versionNo}：{row.after}</Text></View>)}
      {diff?.truncated?<Text style={{color:COLORS.textMuted}}>差异超过 80 项，仅展示前 80 项。长字段截取前 2000 字符。</Text>:null}
      {pair.map(v=><View key={v.id} style={{gap:8}}><Text style={{color:COLORS.text,fontWeight:'700'}}>版本 {v.versionNo} · {v.state}</Text>
        {v.state==='AVAILABLE'&&v.relativePath&&v.mime?.startsWith('image/')?<Image accessibilityLabel={`比较版本 ${v.versionNo}`} source={{uri:`${FileSystem.documentDirectory}${v.relativePath}`}} style={{width:'100%',height:240}} resizeMode="contain"/>:null}
        {v.state==='AVAILABLE'&&['text/plain','text/markdown','application/json'].includes(v.mime??'')?<TextVersionPreview version={v}/>:null}
        <Text selectable style={{color:COLORS.textMuted,fontFamily:'monospace',fontSize:12}}>{recipeText(v).slice(0,20000)}</Text>
      </View>)}
      <Text style={{color:COLORS.textMuted}}>{recipeText(pair[0])===recipeText(pair[1])?'记录的生成参数相同。':'记录的生成参数不同，请查看以上版本快照。'}</Text>
    </>:<Text style={{color:COLORS.textMuted}}>选择两个版本。窄屏按顺序显示，保留完整比例。</Text>}
  </View>;
}
