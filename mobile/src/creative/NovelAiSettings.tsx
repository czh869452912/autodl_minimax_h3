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
  const [advanced,setAdvanced]=useState(false),[modelOpen,setModelOpen]=useState(false),[samplerOpen,setSamplerOpen]=useState(false);
  const medium = isNovelAiMedium(input), v5 = input.model.startsWith('nai-diffusion-5');
  const field = (label: string, key: 'width'|'height'|'steps'|'guidance'|'rescale'|'strength'|'noise'|'inpaintStrength', fixed?: number) => <NovelAiNumberField key={key} label={label} value={fixed ?? input[key]} editable={editable && fixed === undefined} onChange={value=>{if(value!==null)update({[key]:value});}} />;
  const content=<>
    <View style={s.row}><Text style={[s.muted,{fontSize:13}]}>模型</Text><TextAction label={novelAiModelName(input.model)} onPress={()=>setModelOpen(!modelOpen)} icon="expand_more" /></View>
    {modelOpen?<SegmentedChoices label="图片模型" options={NOVELAI_MODELS.map(model=>({id:model,label:novelAiModelName(model)}))} value={input.model} disabled={!editable} onChange={model => {if(model.startsWith('nai-diffusion-4') && input.characters.length>6){Alert.alert('V4.5 最多支持 6 个角色','请先在角色页减少角色，再切换模型。');return;}const e=input.enhancement,scales=e?enhanceScales(e.sourceWidth,e.sourceHeight,model):[];if(e && !scales.length){Alert.alert('当前底图不支持此模型的增强倍率','请保留当前模型，或重新选择其他底图。');return;}setModelOpen(false);update({model,effort:model === 'nai-diffusion-5-full' ? input.effort : 'high',noiseSchedule:'karras',transparent:model.startsWith('nai-diffusion-5') && input.transparent,enhance:model.startsWith('nai-diffusion-5') && input.enhance,...(e?enhancementPatch({...e,scale:scales.includes(e.scale)?e.scale:scales.at(-1)!}):{}),qualityPreset:!model.startsWith('nai-diffusion-5') && input.qualityPreset === 'light' ? 'standard' : input.qualityPreset});}} />:null}
    {input.model === 'nai-diffusion-5-full' ? <><View style={s.row}><Text style={[s.muted,{fontSize:13}]}>Effort</Text><View style={{width:190}}><SegmentedChoices label="V5 Full Effort" options={[{id:'high',label:'High'},{id:'medium',label:'Medium'}]} value={input.effort} disabled={!editable} onChange={effort=>update({effort})} /></View></View></> : null}
    {medium ? <Text style={s.muted}>Medium · 14 步 · 固定采样器与负面预设</Text> : null}
    {input.enhancement?<Text style={s.muted}>单张增强 · 倍率与强度在画布面板中调整</Text>:<><SectionHeading title="画面尺寸" detail={`${input.width} × ${input.height}`} />
    <SegmentedChoices label="图片比例" options={[{id:'832x1216',label:'竖图'},{id:'1024x1024',label:'方图'},{id:'1216x832',label:'横图'},{id:'1472x2112',label:'大竖图'}]} value={`${input.width}x${input.height}`} disabled={!editable} onChange={value=>{ const [width,height]=value.split('x').map(Number); update({width,height}); }} />
    <View style={[s.row,{flexWrap:'nowrap'}]}>{field('宽度（64 的倍数）','width')}<IconAction label="交换宽高" icon="refresh" disabled={!editable} onPress={()=>update({width:input.height,height:input.width})} />{field('高度（64 的倍数）','height')}</View>
    </>}
    <SectionHeading title="一次生成" /><SegmentedChoices label="生成张数" options={['1','2','3','4'].map(id=>({id,label:id}))} value={String(input.samples)} disabled={!editable || input.enhance || Boolean(input.enhancement)} onChange={value=>update({samples:Number(value)})} />
    {input.action!=='generate' && !input.enhancement?<><SectionHeading title="底图影响" /><View style={s.row}>{field('变化强度（0–1）','strength')}{field('额外噪声（0–1）','noise')}</View></>:null}
    {input.enhance && !input.enhancement?<><Text style={s.muted}>已保留旧草稿的 Max 增强设置。</Text><TextAction label="切回普通图生图" disabled={!editable} onPress={()=>update({enhance:false})} /></>:null}
    <SectionHeading title="提示词引导" /><View style={s.row}>{field('引导强度','guidance')}<NovelAiNumberField label="图片 Seed" placeholder="随机" value={input.seed} editable={editable} onChange={seed=>update({seed})} /></View>
    <TextAction label={advanced?'收起专业参数':'专业参数'} onPress={()=>setAdvanced(!advanced)} />
    {advanced?<><SectionHeading title="采样与引导" /><View style={s.row}>{field('步数','steps',medium ? 14 : undefined)}{field('Rescale','rescale',medium ? 0 : undefined)}</View>
    <View style={s.row}><Text style={s.muted}>采样器</Text><TextAction label={samplerNames[NOVELAI_SAMPLERS.indexOf(medium?'k_euler_ancestral':input.sampler)]} icon="expand_more" disabled={!editable || medium} onPress={()=>setSamplerOpen(!samplerOpen)} /></View>
    {samplerOpen && !medium?<View accessibilityRole="radiogroup" accessibilityLabel="图片采样器" style={{gap:2}}>{NOVELAI_SAMPLERS.map((sampler,index)=><Pressable key={sampler} accessibilityRole="radio" accessibilityLabel={samplerNames[index]} accessibilityState={{checked:input.sampler===sampler,disabled:!editable}} disabled={!editable} onPress={()=>{update({sampler});setSamplerOpen(false);}} style={{minHeight:36,padding:8,borderRadius:6,backgroundColor:input.sampler===sampler?COLORS.primarySoft:COLORS.surface}}><Text style={{color:input.sampler===sampler?COLORS.primary:COLORS.text,fontSize:14}}>{samplerNames[index]}</Text></Pressable>)}</View>:null}
    {!v5 ? <SegmentedChoices label="图片噪声设置" options={(['karras','exponential','polyexponential'] as const).map(id=>({id,label:id}))} value={input.noiseSchedule} disabled={!editable} onChange={noiseSchedule=>update({noiseSchedule})} /> : <Text style={s.muted}>V5 使用 Karras 噪声计划。</Text>}
    <TextAction label="恢复随机种子" disabled={!editable || input.seed === null} onPress={()=>update({seed:null})} />
    {v5 ? <><NovelAiToggle label="透明背景" value={input.transparent} onChange={transparent=>update({transparent})} disabled={!editable} /><NovelAiToggle label="保留透明边缘颜色（Straight Alpha）" value={input.straightAlpha} onChange={straightAlpha=>update({straightAlpha})} disabled={!editable} /><NovelAiToggle label="自动整理引号中的画面文字" value={input.autoText} onChange={autoText=>update({autoText})} disabled={!editable} /></> : null}
    {input.action !== 'generate' ? <><NovelAiNumberField label="额外噪声 Seed" placeholder="默认主种子减一" value={input.extraNoiseSeed} editable={editable} onChange={extraNoiseSeed=>update({extraNoiseSeed})} /></> : null}
    {input.action === 'infill' ? <><SectionHeading title="局部重绘" />{field('未遮罩区域变化强度（0–1）','inpaintStrength')}<NovelAiToggle label="合成回原图" value={input.addOriginalImage} onChange={addOriginalImage=>update({addOriginalImage})} disabled={!editable} /></> : null}
    </>:null}
  </>;
  return inline?<View style={{flex:1,backgroundColor:COLORS.surface}}><View style={[s.row,{paddingHorizontal:12,borderBottomWidth:1,borderBottomColor:COLORS.border}]}><Text style={{fontSize:16,fontWeight:'700',color:COLORS.text}}>生成设置</Text><IconAction label="关闭生成设置" icon="close" onPress={onClose} /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:12,gap:12}}>{content}</ScrollView></View>:<ParameterSheet fullScreen title="生成设置" onClose={onClose}>{content}</ParameterSheet>;
}
