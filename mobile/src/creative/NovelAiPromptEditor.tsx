import {WeightedPromptInput} from './WeightedPromptInput';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { isNovelAiMedium, prepareNovelAiRequest, type NovelAiDraftInput } from './novelAiProtocol';
import { NEGATIVE_PRESETS, presetNames, QUALITY_PRESETS } from './novelAiPresets';
import { InlineWorkbenchPanel, IconAction, ParameterSheet, SectionHeading, SegmentedChoices, TextAction } from './WorkbenchUI';
import { NovelAiToggle } from './NovelAiSettings';
import { creativeUI as s } from './creativeUI';
import { COLORS } from '../ui/theme';
import { NovelAiTags } from './NovelAiTags';
import { NovelAiNumberField } from './NovelAiNumberField';

export function NovelAiPromptEditor({ input, update, editable, tab, setTab, onClose, references, onAssist,onImport,focusPrompt=false, inline=false, description='提示词、角色与底图自动保存在本草稿' }: { input: NovelAiDraftInput; update: (patch: Partial<NovelAiDraftInput>) => void; editable: boolean; tab: string; setTab: (tab: string) => void; onClose: () => void; references: ReactNode;onAssist:()=>void;onImport?:()=>void;focusPrompt?:boolean; description?:string;inline?:boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [promptOptions,setPromptOptions]=useState(false);
  const [charactersOpen,setCharactersOpen]=useState(true);
  useEffect(()=>{if(tab==='characters')setCharactersOpen(true);},[tab]);
  const [characterTabs,setCharacterTabs]=useState<Record<number,string>>({});
  const [collapsedCharacters,setCollapsedCharacters]=useState<Record<number,boolean>>({});
  const promptArea=['prompt','negative','characters'].includes(tab);
  const tabs=<SegmentedChoices variant="tabs" singleRow label="画面编辑分页" options={[{id:'prompt',label:'提示词'},{id:'references',label:'参考图'},{id:'chunks',label:'片段'}]} value={promptArea?'prompt':tab} onChange={setTab} />;
  const medium = isNovelAiMedium(input), maxCharacters=input.model.startsWith('nai-diffusion-5') ? 32 : 6;
  const field = (label: string, value: string, onChangeText: (value: string) => void, disabled=false) => <WeightedPromptInput autoFocus={focusPrompt&&label==='图片提示词'} accessibilityLabel={label} placeholder={label} placeholderTextColor={COLORS.textMuted} value={value} editable={editable && !disabled} multiline onChangeText={onChangeText} style={[s.input,{minHeight:150,fontSize:13,lineHeight:20,textAlignVertical:'top',borderColor:COLORS.border,backgroundColor:COLORS.background,borderRadius:12,padding:12}]} />;
  let preview: {input:string;parameters:{negative_prompt:string}} | undefined;
  try { preview=JSON.parse(prepareNovelAiRequest({...input,action:'generate',enhance:false,enhancement:null},()=>0).requestJson); } catch { /* Incomplete input remains editable. */ }
  const content=<>
    {!inline?tabs:null}
    {promptArea?<View style={{alignSelf:'flex-start',minWidth:160}}><SegmentedChoices singleRow label="提示词类型" options={[{id:'prompt',label:input.characters.length?'Base Prompt':'Prompt'},{id:'negative',label:'UC · 负面'}]} value={tab==='negative'?'negative':'prompt'} onChange={setTab} /></View>:null}
    {promptArea && tab !== 'negative' ? <>
      {field('图片提示词',input.prompt,prompt=>update({prompt}))}
<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><TextAction label={`质量：${presetNames[input.qualityPreset]} · ${promptOptions?'收起选项':'选项'}`} onPress={()=>setPromptOptions(!promptOptions)} />{editable?<TextAction label="帮我写" icon="smart_toy" onPress={onAssist} />:null}</View>
      {promptOptions?<>
      <NovelAiTags model={input.model} disabled={!editable} onChoose={tag=>update({prompt:[input.prompt,tag].filter(Boolean).join(', ')})} />
      <SegmentedChoices label="画风模式" options={[{id:'anime',label:'Anime'},{id:'furry',label:'Furry'},{id:'background',label:'背景'}]} value={input.mode} disabled={!editable} onChange={mode=>update({mode})} />
      <SectionHeading title="质量预设" /><SegmentedChoices label="质量预设" options={QUALITY_PRESETS.filter(id=>input.model.startsWith('nai-diffusion-5') || id !== 'light').map(id=>({id,label:presetNames[id]}))} value={input.qualityPreset} disabled={!editable} onChange={qualityPreset=>update({qualityPreset})} />

      <Text style={s.muted}>用英文标签或自然语言描述。可用 1.2::内容:: 调整权重，用引号描述画面中的文字。</Text>
      </>:null}
      {input.model.startsWith('nai-diffusion-5') ? <NovelAiToggle label="透明背景" value={input.transparent} onChange={transparent=>update({transparent})} disabled={!editable} /> : null}
    </> : null}
    {tab === 'negative' ? <><SegmentedChoices label="负面预设" options={NEGATIVE_PRESETS.map(id=>({id,label:presetNames[id]}))} value={medium ? 'heavy' : input.negativePreset} disabled={!editable || medium} onChange={negativePreset=>update({negativePreset})} />{field('图片负面提示词',input.negative,negative=>update({negative}),medium)}{medium ? <Text style={s.muted}>Medium 使用固定 Heavy 预设，当前输入暂存，切回 High 后生效。</Text> : null}</> : null}
    {promptArea?<View style={s.row}><TextAction label={`角色提示词 · ${input.characters.length} ${charactersOpen?'▴':'▾'}`} onPress={()=>setCharactersOpen(!charactersOpen)} /><IconAction label={`添加角色（最多 ${maxCharacters} 个）`} icon="add" disabled={!editable||input.characters.length>=maxCharacters} onPress={()=>{setCharactersOpen(true);update({characters:[...input.characters,{prompt:'',negative:'',enabled:true,x:0.5,y:0.5}]});}}/></View>:null}
    {promptArea && charactersOpen ? <>

      {input.characters.length?<SegmentedChoices singleRow label="角色位置" options={[{id:'auto',label:'AI 自动安排'},{id:'custom',label:'指定位置'}]} value={input.useCoordinates?'custom':'auto'} disabled={!editable} onChange={value=>update({useCoordinates:value==='custom'})}/>:<Text style={s.muted}>为画面中的角色分别描述外观、动作与负面内容。</Text>}
      {input.characters.map((character,index)=>{
        const change=(patch:Partial<typeof character>)=>update({characters:input.characters.map((c,i)=>i === index ? {...c,...patch} : c)});
        return <View key={index} style={s.card}>
          <View style={s.row}><TextAction label={`角色 ${index+1}`} onPress={()=>setCollapsedCharacters(old=>({...old,[index]:!old[index]}))}/><View style={{flexDirection:'row'}}><IconAction label={`${character.enabled?'停用':'启用'}角色 ${index+1}`} icon={character.enabled?'check':'close'} disabled={!editable} onPress={()=>change({enabled:!character.enabled})}/><IconAction label={`上移角色 ${index+1}`} icon="arrow_back" disabled={!editable||index===0} onPress={()=>{const characters=[...input.characters];[characters[index-1],characters[index]]=[characters[index],characters[index-1]];update({characters});}}/><IconAction label={`移除角色 ${index+1}`} icon="delete" disabled={!editable} onPress={()=>update({characters:input.characters.filter((_,i)=>i!==index)})}/></View></View>
          {!collapsedCharacters[index]?<><SegmentedChoices singleRow label={`角色 ${index+1} 提示词类型`} options={[{id:'prompt',label:'Prompt'},{id:'negative',label:'UC · 负面'}]} value={characterTabs[index]??'prompt'} onChange={value=>setCharacterTabs(old=>({...old,[index]:value}))}/>
          {characterTabs[index]==='negative'?field(`角色 ${index+1} 负面`,character.negative,negative=>change({negative}),medium):field(`角色 ${index+1} 提示词`,character.prompt,prompt=>change({prompt}))}
          {input.useCoordinates ? <><Text style={s.muted}>点选角色中心位置 · X {character.x.toFixed(2)} / Y {character.y.toFixed(2)}</Text><Pressable accessibilityLabel={`角色 ${index+1} 位置画布`} disabled={!editable} onPress={e=>{const {locationX,locationY}=e.nativeEvent; const target=e.currentTarget; target.measure((_x,_y,width,height)=>change({x:Math.max(0,Math.min(1,locationX/width)),y:Math.max(0,Math.min(1,locationY/height))}));}} style={{height:160,backgroundColor:COLORS.surfaceRaised,borderRadius:12,borderWidth:1,borderColor:COLORS.border}}>
            {[1,2].map(n=><View key={n} pointerEvents="none" style={{position:'absolute',left:`${n*100/3}%`,height:'100%',borderLeftWidth:1,borderColor:COLORS.border}} />)}
            {[1,2].map(n=><View key={n} pointerEvents="none" style={{position:'absolute',top:`${n*100/3}%`,width:'100%',borderTopWidth:1,borderColor:COLORS.border}} />)}
            <View pointerEvents="none" style={{position:'absolute',left:`${character.x*100}%`,top:`${character.y*100}%`,marginLeft:-12,marginTop:-12,width:24,height:24,borderRadius:12,backgroundColor:COLORS.primary,alignItems:'center',justifyContent:'center'}}><Text style={{color:COLORS.onPrimary}}>{index+1}</Text></View>
          </Pressable><View style={s.row}>{(['x','y'] as const).map(axis=><NovelAiNumberField key={axis} label={`角色 ${index+1} ${axis}（0到1）`} value={character[axis]} editable={editable} onChange={v=>{if(v!==null)change({[axis]:v});}} />)}</View></> : null}
          </>:null}
        </View>;
      })}

    </> : null}
    {tab === 'references' ? references : null}
    {tab === 'chunks' ? <><SectionHeading title="提示词片段" /><Text style={s.muted}>将常用风格、构图存为片段，点选插入描述。</Text>{input.chunks.map((chunk,index)=><View key={index} style={s.card}>
      <TextInput accessibilityLabel={`片段 ${index+1} 名称`} value={chunk.name} editable={editable} onChangeText={name=>update({chunks:input.chunks.map((c,i)=>i === index ? {...c,name} : c)})} style={s.input} />
      {field(`片段 ${index+1} 内容`,chunk.text,text=>update({chunks:input.chunks.map((c,i)=>i === index ? {...c,text} : c)}))}
      <View style={s.row}><TextAction label={`插入${chunk.name}`} disabled={!editable || !chunk.text.trim()} onPress={()=>{update({prompt:[input.prompt,chunk.text].filter(Boolean).join(', ')}); setTab('prompt');}} /><TextAction label={`移除片段 ${index+1}`} disabled={!editable} onPress={()=>update({chunks:input.chunks.filter((_,i)=>i !== index)})} /></View>
    </View>)}<TextAction label="新建片段" disabled={!editable || input.chunks.length>=50} onPress={()=>update({chunks:[...input.chunks,{name:`片段 ${input.chunks.length+1}`,text:''}]})} /></> : null}
    <TextAction label={expanded ? '收起最终提示词' : '查看最终提示词'} onPress={()=>setExpanded(!expanded)} />
    {expanded ? <View style={s.card}><Text style={s.title}>实际发送的描述</Text><Text selectable style={s.body}>{preview?.input || '填写描述后预览'}</Text><Text style={s.title}>实际发送的负面词</Text><Text selectable style={s.muted}>{preview?.parameters.negative_prompt || '无'}</Text></View> : null}
  </>;
  return inline?<InlineWorkbenchPanel title="画面编辑" header={<View style={{flexDirection:'row',alignItems:'center'}}><View style={{flex:1}}>{tabs}</View>{onImport?<IconAction label="导入图片或生成信息" icon="add_photo_alternate" disabled={!editable} onPress={onImport}/>:null}</View>} onClose={onClose}>{content}</InlineWorkbenchPanel>:<ParameterSheet fullScreen title="画面编辑" description={description} onClose={onClose}>{content}</ParameterSheet>;
}
