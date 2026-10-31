import { KeyboardSurface, KeyboardAwareScrollView as ScrollView } from '../ui/KeyboardSurface';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, type IconName } from '../ui/icons';
import { WorkbenchMotion } from './WorkbenchMotion';
import { COLORS } from '../ui/theme';

import { WorkspaceDensity as DensityContext, useCompactWorkbench } from '../ui/WorkspaceDensity';
export { useCompactWorkbench } from '../ui/WorkspaceDensity';
export const WorkbenchNavigationContext=createContext<{register:(guard:()=>Promise<boolean>)=>()=>void}|null>(null);
export function useWorkbenchLeave(guard:()=>Promise<boolean>){
  const context=useContext(WorkbenchNavigationContext),latest=useRef(guard);latest.current=guard;
  useEffect(()=>context?.register(()=>latest.current()),[context]);
}
export function CompactWorkbench({children}:{children:ReactNode}) { return <DensityContext.Provider value><WorkbenchMotion>{children}</WorkbenchMotion></DensityContext.Provider>; }


/** A bounded, in-place tool region: the owner keeps the canvas visible beside it. */
export function InlineWorkbenchPanel({title,onClose,children,header}:{title:string;onClose:()=>void;children:ReactNode;header?:ReactNode}) {
  const [tight,setTight]=useState(false);
  return <View onLayout={event=>setTight(event.nativeEvent.layout.height<140)} style={{flex:1,minHeight:0,backgroundColor:COLORS.surface}}>
    {!tight?<View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:8,paddingVertical:4,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:COLORS.border}}>{header?<View style={{flex:1}}>{header}</View>:<Text accessibilityRole="header" style={{flex:1,fontSize:13,fontWeight:'600',color:COLORS.text}}>{title}</Text>}<IconAction label={`关闭${title}`} icon="close" onPress={onClose}/></View>:null}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:12,gap:10,paddingBottom:20}}>{children}</ScrollView>
  </View>;
}

export function TextAction({ label, onPress, disabled = false, icon }: { label: string; onPress: () => void; disabled?: boolean; icon?: IconName }) {
  const compact=useCompactWorkbench();
  return <Pressable hitSlop={compact?4:undefined} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [w.textAction, compact && {minHeight:48,paddingVertical:4}, pressed && w.pressed, disabled && w.disabled]}>
    {icon ? <AppIcon name={icon} size={compact?16:18} color={COLORS.primaryActive} /> : null}<Text style={[w.actionText,compact && {fontSize:12,lineHeight:17}]}>{label}</Text>
  </Pressable>;
}

export function SettingRow({ label, value, onPress, expanded, disabled = false, icon }: { label: string; value?: string; onPress: () => void; expanded?: boolean; disabled?: boolean; icon?: IconName }) {
  const compact=useCompactWorkbench();
  return <Pressable accessibilityRole="button" accessibilityLabel={value ? `${label}，${value}` : label} accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }) }} disabled={disabled} onPress={onPress} style={({ pressed }) => [w.setting,compact && {paddingVertical:6,minHeight:48}, pressed && w.pressed, disabled && w.disabled]}>
    {icon ? <AppIcon name={icon} size={21} /> : null}
    <View style={{ flex: 1, gap: 2 }}><Text style={w.settingLabel}>{label}</Text>{value ? <Text style={w.caption}>{value}</Text> : null}</View>
    <AppIcon name={expanded === undefined ? 'chevron_right' : expanded ? 'expand_less' : 'expand_more'} size={21} />
  </Pressable>;
}

export function SegmentedChoices<T extends string>({ label, options, value, onChange, disabled = false, singleRow = false, variant='segments' }: { variant?:'segments'|'tabs';label: string; options: ReadonlyArray<{ id: T; label: string; icon?: IconName }>; value: T; onChange: (id: T) => void; disabled?: boolean; singleRow?: boolean }) {
  const compact=useCompactWorkbench();
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[w.segments,compact && {padding:2,gap:2,borderRadius:10},singleRow && {flexWrap:'nowrap'},variant==='tabs' && {backgroundColor:'transparent',padding:0,gap:12}]}>{options.map(option => <Pressable key={option.id} hitSlop={compact?4:undefined} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: value === option.id, disabled }} disabled={disabled} onPress={() => onChange(option.id)} style={({ pressed }) => [w.segment,compact && {minHeight:48,padding:5,borderRadius:8,flexBasis:60},singleRow && {flexBasis:0,paddingHorizontal:4}, value === option.id && w.segmentSelected,variant==='tabs' && {borderRadius:0,backgroundColor:'transparent',elevation:0,shadowOpacity:0,borderBottomWidth:2,borderBottomColor:value===option.id?COLORS.primary:'transparent'}, pressed && w.pressed, disabled && w.disabled]}>
    {option.icon ? <AppIcon name={option.icon} size={compact?16:19} color={value === option.id ? COLORS.primaryActive : COLORS.textMuted} /> : null}<Text numberOfLines={singleRow?1:undefined} adjustsFontSizeToFit={singleRow} minimumFontScale={0.85} style={[w.segmentText,compact && {fontSize:12}, value === option.id && w.segmentTextSelected]}>{option.label}</Text>
  </Pressable>)}</View>;
}

export function ParameterSheet({ title, description, onClose, children, fullScreen = false, scrollable = true }: { title: string; description?: string; onClose: () => void; children: ReactNode; fullScreen?:boolean; scrollable?:boolean }) {
  const compact=useCompactWorkbench();
  return <Modal transparent={!fullScreen} visible animationType="slide" onRequestClose={onClose}>
    <KeyboardSurface style={fullScreen ? {flex:1,backgroundColor:COLORS.surface} : w.modal}>
      {!fullScreen?<Pressable accessibilityLabel={`关闭${title}`} accessible={false} importantForAccessibility="no" onPress={onClose} style={StyleSheet.absoluteFill} />:null}
      <SafeAreaView edges={fullScreen ? ['top','bottom','left','right'] : ['bottom', 'left', 'right']} style={fullScreen ? {flex:1,backgroundColor:COLORS.surface} : w.sheet}>
        <View style={w.sheetHeader}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={w.sectionTitle}>{title}</Text>{description ? <Text style={w.caption}>{description}</Text> : null}</View><TextAction label="完成" onPress={onClose} /></View>
        <>{scrollable?<ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="none" contentContainerStyle={{ padding: compact?12:20, gap: compact?10:16 }}>{children}</ScrollView>:<View style={{flex:1,minHeight:0}}>{children}</View>}</>
      </SafeAreaView>
    </KeyboardSurface>
  </Modal>;
}

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  const compact=useCompactWorkbench();
  return <View style={w.sectionHeading}><Text accessibilityRole="header" style={[w.sectionTitle,compact && {fontSize:14}]}>{title}</Text>{detail ? <Text style={w.caption}>{detail}</Text> : null}</View>;
}

export function IconAction({label,icon,onPress,disabled=false,selected=false}:{label:string;icon:IconName;onPress:()=>void;disabled?:boolean;selected?:boolean}) {
  const compact=useCompactWorkbench(),{fontScale}=useWindowDimensions();
  const size=48;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled,selected}} disabled={disabled} onPress={onPress} hitSlop={5} style={({pressed})=>({width:size,minHeight:size,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:selected?COLORS.primarySoft:pressed?COLORS.surfaceRaised:'transparent',opacity:disabled?0.4:1,transform:[{scale:pressed?0.94:1}]})}><AppIcon name={icon} size={compact?17:19} color={selected?COLORS.primary:COLORS.textMuted} /></Pressable>;
}

export const w = StyleSheet.create({
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  caption: { fontSize: 13, lineHeight: 20, color: COLORS.textMuted },
  textAction: { minHeight: 48, paddingHorizontal: 4, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 1 },
  actionText: { fontSize: 14, lineHeight: 21, color: COLORS.primaryActive, fontWeight: '600', flexShrink: 1 },
  setting: { minHeight: 48, flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  settingLabel: { color: COLORS.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 4, backgroundColor: COLORS.surfaceRaised, borderRadius: 14 },
  segment: { minHeight: 48, flexGrow: 1, flexBasis: 72, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 10 },
  segmentSelected: { backgroundColor: COLORS.surface,shadowColor:'#172b23',shadowOffset:{width:0,height:1},shadowOpacity:0.06,shadowRadius:2,elevation:1 },
  segmentText: { fontSize: 14, fontWeight: '500', color: COLORS.textMuted, textAlign: 'center', flexShrink: 1 },
  segmentTextSelected: { fontWeight: '700', color: COLORS.primaryActive },
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.scrim, paddingTop: 48 },
  sheet: { maxHeight: '92%', backgroundColor: COLORS.surface, borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden' },
  sheetHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomColor: COLORS.border, borderBottomWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.65 }, disabled: { opacity: 0.45 },
});

/** An expanded section inside the current workspace, without a modal or route. */
export function WorkbenchSection({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  return <View style={{borderWidth:1,borderColor:COLORS.border,borderRadius:10,padding:10,gap:8,backgroundColor:COLORS.surface}}>
    <View style={{flexDirection:'row',alignItems:'center'}}><Text accessibilityRole="header" style={{flex:1,fontSize:14,fontWeight:'600',color:COLORS.text}}>{title}</Text><IconAction label={`关闭${title}`} icon="close" onPress={onClose}/></View>
    {children}
  </View>;
}
