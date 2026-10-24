import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { creativeUI as s } from './creativeUI';
import { useCompactWorkbench } from './WorkbenchUI';

/** Keep intermediate keyboard text ("0.", "-") while numeric draft values autosave. */
export function NovelAiNumberField({ label, value, onChange, editable, placeholder }: { label: string; value: number | null; onChange: (value: number | null) => void; editable: boolean; placeholder?: string }) {
  const compact=useCompactWorkbench();
  const [focused,setFocused]=useState(false), [text,setText]=useState(value === null ? '' : String(value));
  const lastEdited=useRef(value);
  useEffect(()=>{if(!focused || value!==lastEdited.current)setText(value === null ? '' : String(value));lastEdited.current=value;},[value,focused]);
  return <View style={{flexGrow:1,flexBasis:compact?90:120,gap:compact?3:6}}><Text style={[s.muted,compact && {fontSize:12,lineHeight:17}]}>{label}</Text><TextInput accessibilityLabel={label} value={text} placeholder={placeholder} editable={editable} keyboardType="decimal-pad" selectTextOnFocus onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChangeText={next=>{setText(next);if(next === '' && placeholder){lastEdited.current=null;onChange(null);}else if(/^-?\d+(?:\.\d*)?$/.test(next) && Number.isFinite(Number(next))){lastEdited.current=Number(next);onChange(Number(next));}}} style={[s.input,compact && {minHeight:36,padding:6,borderRadius:6,fontSize:14}]} /></View>;
}
