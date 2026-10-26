import {NovelAiRangeField} from './NovelAiRangeField';
import { useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../ui/KeyboardSurface';
import { isNovelAiMedium, NOVELAI_MODELS, NOVELAI_SAMPLERS, novelAiModelName, samplerNames, type NovelAiDraftInput } from './novelAiProtocol';
import { IconAction, ParameterSheet, SectionHeading, SegmentedChoices, TextAction, useCompactWorkbench } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';
import { COLORS } from '../ui/theme';
import { NovelAiNumberField } from './NovelAiNumberField';
import { enhanceScales, enhancementPatch } from './novelAiEnhancement';

export function NovelAiToggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const compact=useCompactWorkbench();
  return <View style={s.row}><Text style={[s.body,{flex:1},compact && {fontSize:13,lineHeight:18}]}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} /></View>;
}

export function NovelAiSettings({ input, update, editable, onClose, inline=false }: { input: NovelAiDraftInput; update: (patch: Partial<NovelAiDraftInput>) => void; editable: boolean; onClose: () => void; inline?:boolean }) {
  const [advanced,setAdvanced]=useState(false),[modelOpen,setModelOpen]=useState(false),[samplerOpen,setSamplerOpen]=useState(false),[modeOpen,setModeOpen]=useState(false),[sizeOpen,setSizeOpen]=useState(false);
  const normal=[[832,1216],[1024,1024],[1216,832]],large=[[1472,2112],[1728,1728],[2112,1472]];
  const sizeGroup=normal.some(([w,h])=>w===input.width&&h===input.height)?'normal':large.some(([w,h])=>w===input.width&&h===input.height)?'large':'custom';
  const [customSize,setCustomSize]=useState(false);
  const range=(label:string,key:'steps'|'guidance'|'rescale',min:number,max:number,step:number,fixed?:number)=><NovelAiRangeField horizontal label={label} value={fixed??input[key]} min={min} max={max} step={step} editable={editable&&fixed===undefined} onChange={value=>update({[key]:value})}/>;
  const medium = isNovelAiMedium(input), v5 = input.model.startsWith('nai-diffusion-5');
  const field = (label: string, key: 'width'|'height'|'steps'|'guidance'|'rescale'|'strength'|'noise'|'inpaintStrength', fixed?: number) => <NovelAiNumberField key={key} label={label} value={fixed ?? input[key]} editable={editable && fixed === undefined} onChange={value=>{if(value!==null)update({[key]:value});}} />;
  const content=<>
    <View style={s.row}><Text style={[s.muted,{fontSize:13}]}>模型</Text><TextAction label={novelAiModelName(input.model)} onPress={()=>setModelOpen(!modelOpen)} icon="expand_more" /></View>
    {modelOpen?<SegmentedChoices label="图片模型" options={NOVELAI_MODELS.map(model=>({id:model,label:novelAiModelName(model)}))} value={input.model} disabled={!editable} onChange={model => {if(model.startsWith('nai-diffusion-4') && input.characters.length>6){Alert.alert('V4.5 最多支持 6 个角色','请先在角色页减少角色，再切换模型。');return;}const e=input.enhancement,scales=e?enhanceScales(e.sourceWidth,e.sourceHeight,model):[];if(e && !scales.length){Alert.alert('当前底图不支持此模型的增强倍率','请保留当前模型，或重新选择其他底图。');return;}setModelOpen(false);update({model,effort:model === 'nai-diffusion-5-full' ? input.effort : 'high',noiseSchedule:'karras',transparent:model.startsWith('nai-diffusion-5') && input.transparent,enhance:model.startsWith('nai-diffusion-5') && input.enhance,...(e?enhancementPatch({...e,scale:scales.includes(e.scale)?e.scale:scales.at(-1)!}):{}),qualityPreset:!model.startsWith('nai-diffusion-5') && input.qualityPreset === 'light' ? 'standard' : input.qualityPreset});}} />:null}
    <View style={s.row}><Text style={s.muted}>画风</Text><TextAction label={{anime:'Anime',furry:'Furry',background:'背景'}[input.mode]} icon="expand_more" disabled={!editable} onPress={()=>setModeOpen(!modeOpen)}/></View>
    {modeOpen?<SegmentedChoices singleRow label="画风模式" options={[{id:'anime',label:'Anime'},{id:'furry',label:'Furry'},{id:'background',label:'背景'}]} value={input.mode} disabled={!editable} onChange={mode=>{update({mode});setModeOpen(false);}}/>:null}
    {input.model === 'nai-diffusion-5-full' ? <><View style={s.row}><Text style={[s.muted,{fontSize:13}]}>Effort</Text><View style={{width:190}}><SegmentedChoices label="V5 Full Effort" options={[{id:'high',label:'High'},{id:'medium',label:'Medium'}]} value={input.effort} disabled={!editable} onChange={effort=>update({effort})} /></View></View></> : null}
    {medium ? <Text style={s.muted}>Medium · 14 步 · 固定采样器与负面预设</Text> : null}
    {input.enhancement?<Text style={s.muted}>单张增强 · 倍率与强度在画布面板中调整</Text>:<><SectionHeading title="画面尺寸" detail={`${input.width} × ${input.height}`} />
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}><TextAction label={sizeGroup==='normal'?'标准':sizeGroup==='large'?'大尺寸':'自定义'} icon="expand_more" disabled={!editable} onPress={()=>setSizeOpen(!sizeOpen)}/><View style={{flex:1}}><SegmentedChoices singleRow label="图片比例" options={[{id:'portrait',label:'竖图'},{id:'square',label:'方图'},{id:'landscape',label:'横图'}]} value={input.width===input.height?'square':input.width<input.height?'portrait':'landscape'} disabled={!editable} onChange={ratio=>{const [width,height]=(sizeGroup==='large'?large:normal)[['portrait','square','landscape'].indexOf(ratio)];setCustomSize(false);update({width,height});}}/></View></View>
    {sizeOpen?<SegmentedChoices singleRow label="尺寸预设" options={[{id:'normal',label:'标准'},{id:'large',label:'大尺寸'},{id:'custom',label:'自定义'}]} value={customSize?'custom':sizeGroup} disabled={!editable} onChange={group=>{setSizeOpen(false);setCustomSize(group==='custom');if(group!=='custom'){const [width,height]=(group==='large'?large:normal)[input.width===input.height?1:input.width<input.height?0:2];update({width,height});}}}/>:null}
    {customSize||sizeGroup==='custom'?<View style={[s.row,{flexWrap:'nowrap'}]}>{field('宽度（64 的倍数）','width')}<IconAction label="交换宽高" icon="refresh" disabled={!editable} onPress={()=>update({width:input.height,height:input.width})}/>{field('高度（64 的倍数）','height')}</View>:null}
    </>}
    <SectionHeading title="一次生成" /><SegmentedChoices label="生成张数" options={['1','2','3','4'].map(id=>({id,label:id}))} value={String(input.samples)} disabled={!editable || input.enhance || Boolean(input.enhancement)} onChange={value=>update({samples:Number(value)})} />
    {input.action!=='generate' && !input.enhancement?<><SectionHeading title="底图影响" /><View style={s.row}>{field('变化强度（0–1）','strength')}{field('额外噪声（0–1）','noise')}</View></>:null}
    {input.enhance && !input.enhancement?<><Text style={s.muted}>已保留旧草稿的 Max 增强设置。</Text><TextAction label="切回普通图生图" disabled={!editable} onPress={()=>update({enhance:false})} /></>:null}
    <SectionHeading title="AI 设置" />
    {range('步数','steps',1,50,1,medium?14:undefined)}
    {range('引导强度','guidance',0,10,0.1)}
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}><NovelAiNumberField label="图片 Seed" placeholder="随机" value={input.seed} editable={editable} onChange={seed=>update({seed})}/><IconAction label="恢复随机种子" icon="refresh" disabled={!editable||input.seed===null} onPress={()=>update({seed:null})}/></View>
    <View style={s.row}><Text style={s.muted}>采样器</Text><TextAction label={samplerNames[NOVELAI_SAMPLERS.indexOf(medium?'k_euler_ancestral':input.sampler)]} icon="expand_more" disabled={!editable || medium} onPress={()=>setSamplerOpen(!samplerOpen)} /></View>
    {samplerOpen && !medium?<View accessibilityRole="radiogroup" accessibilityLabel="图片采样器" style={{gap:2}}>{NOVELAI_SAMPLERS.map((sampler,index)=><Pressable key={sampler} accessibilityRole="radio" accessibilityLabel={samplerNames[index]} accessibilityState={{checked:input.sampler===sampler,disabled:!editable}} disabled={!editable} onPress={()=>{update({sampler});setSamplerOpen(false);}} style={{minHeight:36,padding:8,borderRadius:6,backgroundColor:input.sampler===sampler?COLORS.primarySoft:COLORS.surface}}><Text style={{color:input.sampler===sampler?COLORS.primary:COLORS.text,fontSize:14}}>{samplerNames[index]}</Text></Pressable>)}</View>:null}
    <TextAction label={advanced?'收起高级设置':'高级设置'} icon={advanced?'expand_less':'expand_more'} onPress={()=>setAdvanced(!advanced)}/>
    {advanced?<>
    {range('Rescale','rescale',0,1,0.01,medium?0:undefined)}
    {!v5 ? <SegmentedChoices label="图片噪声设置" options={(['karras','exponential','polyexponential'] as const).map(id=>({id,label:id}))} value={input.noiseSchedule} disabled={!editable} onChange={noiseSchedule=>update({noiseSchedule})} /> : <Text style={s.muted}>V5 使用 Karras 噪声计划。</Text>}

    {v5 ? <><NovelAiToggle label="保留透明边缘颜色（Straight Alpha）" value={input.straightAlpha} onChange={straightAlpha=>update({straightAlpha})} disabled={!editable} /><NovelAiToggle label="自动整理引号中的画面文字" value={input.autoText} onChange={autoText=>update({autoText})} disabled={!editable} /></> : null}
    {input.action !== 'generate' ? <><NovelAiNumberField label="额外噪声 Seed" placeholder="默认主种子减一" value={input.extraNoiseSeed} editable={editable} onChange={extraNoiseSeed=>update({extraNoiseSeed})} /></> : null}
    {input.action === 'infill' ? <><SectionHeading title="局部重绘" />{field('未遮罩区域变化强度（0–1）','inpaintStrength')}<NovelAiToggle label="合成回原图" value={input.addOriginalImage} onChange={addOriginalImage=>update({addOriginalImage})} disabled={!editable} /></> : null}
    </>:null}
  </>;
  return inline?<View style={{flex:1,minHeight:0,backgroundColor:COLORS.surface}}><View style={[s.row,{paddingHorizontal:8,borderBottomWidth:0.5,borderBottomColor:COLORS.border}]}><Text style={{fontSize:13,fontWeight:'600',color:COLORS.text}}>生成设置</Text><IconAction label="关闭生成设置" icon="close" onPress={onClose} /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:8,gap:8}}>{content}</ScrollView></View>:<ParameterSheet fullScreen title="生成设置" onClose={onClose}>{content}</ParameterSheet>;
}
