import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { AppIcon } from './icons';
import { COLORS } from './theme';

/** A workspace mode belongs to the header, not persistent bottom navigation. */
export function WorkbenchModeSwitcher({mode,onSelect,disabled=false}:{mode:'create'|'agent';onSelect:(mode:'create'|'agent')=>void;disabled?:boolean}) {
  const anchor=useRef<View>(null);
  const keyboardWait=useRef<ReturnType<typeof Keyboard.addListener>|undefined>(undefined);
  useEffect(()=>()=>keyboardWait.current?.remove(),[]);
  const {width,height}=useWindowDimensions();
  const [position,setPosition]=useState<{x:number;y:number}>();
  useEffect(()=>setPosition(undefined),[width,height]);
  const close=()=>setPosition(undefined);
  const measure=()=>anchor.current?.measureInWindow((x,y,_width,anchorHeight)=>setPosition({x,y:y+anchorHeight+6}));
  const open=()=>{
    keyboardWait.current?.remove();
    if(Keyboard.isVisible()){keyboardWait.current=Keyboard.addListener('keyboardDidHide',()=>{keyboardWait.current?.remove();keyboardWait.current=undefined;measure();});Keyboard.dismiss();}
    else measure();
  };
  return <>
    <View ref={anchor} collapsable={false}><Pressable accessibilityRole="button" accessibilityLabel={`工作模式：${mode==='create'?'手工':'Agent'}`} accessibilityState={{expanded:Boolean(position),disabled}} disabled={disabled} onPress={open} style={({pressed})=>({minHeight:40,flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:8,borderRadius:10,backgroundColor:pressed?COLORS.surfaceRaised:'transparent'})}>
      <Text style={{fontSize:14,fontWeight:'700',color:COLORS.text}}>{mode==='create'?'手工':'Agent'}</Text><AppIcon name="expand_more" size={16}/>
    </Pressable></View>
    {position?<Modal transparent visible animationType="fade" onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭模式选择" onPress={close} style={{flex:1}} />
      <View accessibilityLabel="工作模式" style={{position:'absolute',top:Math.max(8,Math.min(position.y,height-180)),left:Math.max(8,Math.min(position.x,width-216)),width:208,padding:6,borderRadius:14,backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.border,elevation:8,shadowColor:'#15261f',shadowOpacity:0.12,shadowRadius:16,shadowOffset:{width:0,height:4}}}>
        {([{id:'create',title:'手工',detail:'直接调整参数与生成'},{id:'agent',title:'Agent',detail:'围绕项目与助手协作'}] as const).map(item=><Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={`${item.title}工作模式`} accessibilityState={{checked:mode===item.id}} onPress={()=>{close();if(mode!==item.id)onSelect(item.id);}} style={({pressed})=>({padding:12,borderRadius:10,gap:3,backgroundColor:mode===item.id?COLORS.primarySoft:pressed?COLORS.surfaceRaised:'transparent'})}><Text style={{fontSize:14,fontWeight:'600',color:mode===item.id?COLORS.primary:COLORS.text}}>{item.title}</Text><Text style={{fontSize:12,color:COLORS.textMuted}}>{item.detail}</Text></Pressable>)}
      </View>
    </Modal>:null}
  </>;
}
