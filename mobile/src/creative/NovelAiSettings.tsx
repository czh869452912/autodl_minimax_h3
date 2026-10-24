import { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { isNovelAiMedium, NOVELAI_MODELS, NOVELAI_SAMPLERS, novelAiModelName, samplerNames, type NovelAiDraftInput } from './novelAiProtocol';
import { ParameterSheet, SectionHeading, SegmentedChoices, TextAction } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';
import { COLORS } from '../ui/theme';
import { NovelAiNumberField } from './NovelAiNumberField';
import { enhanceScales, enhancementPatch } from './novelAiEnhancement';

export function NovelAiToggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <View style={s.row}><Text style={[s.body,{flex:1}]}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} /></View>;
}

export function NovelAiSettings({ input, update, editable, onClose }: { input: NovelAiDraftInput; update: (patch: Partial<NovelAiDraftInput>) => void; editable: boolean; onClose: () => void }) {
  const [advanced,setAdvanced]=useState(false);
  const medium = isNovelAiMedium(input), v5 = input.model.startsWith('nai-diffusion-5');
  const field = (label: string, key: 'width'|'height'|'steps'|'guidance'|'rescale'|'strength'|'noise'|'inpaintStrength', fixed?: number) => <NovelAiNumberField key={key} label={label} value={fixed ?? input[key]} editable={editable && fixed === undefined} onChange={value=>{if(value!==null)update({[key]:value});}} />;
  return <ParameterSheet title="生成设置" description="自动保存 · 返回即可继续创作" onClose={onClose}>
    <SectionHeading title="模型" />
    <SegmentedChoices label="图片模型" options={NOVELAI_MODELS.map(model=>({id:model,label:novelAiModelName(model)}))} value={input.model} disabled={!editable} onChange={model => {if(model.startsWith('nai-diffusion-4') && input.characters.length>6){Alert.alert('V4.5 最多支持 6 个角色','请先在角色页减少角色，再切换模型。');return;}const e=input.enhancement,scales=e?enhanceScales(e.sourceWidth,e.sourceHeight,model):[];if(e && !scales.length){Alert.alert('当前底图不支持此模型的增强倍率','请保留当前模型，或重新选择其他底图。');return;}update({model,effort:model === 'nai-diffusion-5-full' ? input.effort : 'high',noiseSchedule:'karras',transparent:model.startsWith('nai-diffusion-5') && input.transparent,enhance:model.startsWith('nai-diffusion-5') && input.enhance,...(e?enhancementPatch({...e,scale:scales.includes(e.scale)?e.scale:scales.at(-1)!}):{}),qualityPreset:!model.startsWith('nai-diffusion-5') && input.qualityPreset === 'light' ? 'standard' : input.qualityPreset});}} />
    {input.model === 'nai-diffusion-5-full' ? <><SectionHeading title="Effort" /><SegmentedChoices label="V5 Full Effort" options={[{id:'high',label:'High · 更精细'},{id:'medium',label:'Medium · 更快速'}]} value={input.effort} disabled={!editable} onChange={effort=>update({effort})} /></> : null}
    {medium ? <Text style={s.muted}>Medium 固定 14 步、Euler Ancestral 和 Heavy 负面预设。自定义负面词、Rescale 暂存，切回 High 后恢复。</Text> : null}
    {input.enhancement?<Text style={s.muted}>增强倍率和变化强度请直接在画布下方的 Enhance 面板调整。每次增强输出单张图片。</Text>:<><SectionHeading title="画面尺寸" detail={`${input.width} × ${input.height}`} />
    <SegmentedChoices label="图片比例" options={[{id:'832x1216',label:'竖图'},{id:'1024x1024',label:'方图'},{id:'1216x832',label:'横图'},{id:'1472x2112',label:'大竖图'}]} value={`${input.width}x${input.height}`} disabled={!editable} onChange={value=>{ const [width,height]=value.split('x').map(Number); update({width,height}); }} />
    {advanced?<View style={s.row}>{field('宽度（64 的倍数）','width')}{field('高度（64 的倍数）','height')}</View>:null}
    {advanced?<TextAction label="交换宽高" disabled={!editable} onPress={()=>update({width:input.height,height:input.width})} />:null}
    <Text style={s.muted}>最多 3,145,728 像素。尺寸、步数和张数会影响费用。</Text></>}
    <SectionHeading title="一次生成" /><SegmentedChoices label="生成张数" options={['1','2','3','4'].map(id=>({id,label:`${id} 张`}))} value={String(input.samples)} disabled={!editable || input.enhance || Boolean(input.enhancement)} onChange={value=>update({samples:Number(value)})} />
    {input.action!=='generate' && !input.enhancement?<><SectionHeading title="底图影响" /><View style={s.row}>{field('变化强度（0–1）','strength')}{field('额外噪声（0–1）','noise')}</View></>:null}
    {input.enhance && !input.enhancement?<><Text style={s.muted}>已保留旧草稿的 Max 增强设置。</Text><TextAction label="切回普通图生图" disabled={!editable} onPress={()=>update({enhance:false})} /></>:null}
    <TextAction label={advanced?'收起专业参数':'专业参数'} onPress={()=>setAdvanced(!advanced)} />
    {advanced?<><SectionHeading title="采样与引导" /><View style={s.row}>{field('步数','steps',medium ? 14 : undefined)}{field('引导强度','guidance')}{field('Rescale','rescale',medium ? 0 : undefined)}</View>
    <SegmentedChoices label="图片采样器" options={NOVELAI_SAMPLERS.map((id,index)=>({id,label:samplerNames[index]}))} value={medium ? 'k_euler_ancestral' : input.sampler} disabled={!editable || medium} onChange={sampler=>update({sampler})} />
    {!v5 ? <SegmentedChoices label="图片噪声设置" options={(['karras','exponential','polyexponential'] as const).map(id=>({id,label:id}))} value={input.noiseSchedule} disabled={!editable} onChange={noiseSchedule=>update({noiseSchedule})} /> : <Text style={s.muted}>V5 使用 Karras 噪声计划。</Text>}
    <NovelAiNumberField label="图片 Seed" placeholder="留空，每次随机" value={input.seed} editable={editable} onChange={seed=>update({seed})} />
    <TextAction label="恢复随机种子" disabled={!editable || input.seed === null} onPress={()=>update({seed:null})} />
    {v5 ? <><NovelAiToggle label="透明背景" value={input.transparent} onChange={transparent=>update({transparent})} disabled={!editable} /><NovelAiToggle label="保留透明边缘颜色（Straight Alpha）" value={input.straightAlpha} onChange={straightAlpha=>update({straightAlpha})} disabled={!editable} /><NovelAiToggle label="自动整理引号中的画面文字" value={input.autoText} onChange={autoText=>update({autoText})} disabled={!editable} /></> : null}
    {input.action !== 'generate' ? <><NovelAiNumberField label="额外噪声 Seed" placeholder="默认主种子减一" value={input.extraNoiseSeed} editable={editable} onChange={extraNoiseSeed=>update({extraNoiseSeed})} /></> : null}
    {input.action === 'infill' ? <><SectionHeading title="局部重绘" />{field('未遮罩区域变化强度（0–1）','inpaintStrength')}<NovelAiToggle label="合成回原图" value={input.addOriginalImage} onChange={addOriginalImage=>update({addOriginalImage})} disabled={!editable} /></> : null}
    </>:null}
  </ParameterSheet>;
}
