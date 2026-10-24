import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { creativeUI as s } from './creativeUI';

/** Keep intermediate keyboard text ("0.", "-") while numeric draft values autosave. */
export function NovelAiNumberField({ label, value, onChange, editable, placeholder }: { label: string; value: number | null; onChange: (value: number | null) => void; editable: boolean; placeholder?: string }) {
  const [focused,setFocused]=useState(false), [text,setText]=useState(value === null ? '' : String(value));
  useEffect(()=>{if(!focused)setText(value === null ? '' : String(value));},[value,focused]);
  return <View style={{flexGrow:1,flexBasis:120,gap:6}}><Text style={s.muted}>{label}</Text><TextInput accessibilityLabel={label} value={text} placeholder={placeholder} editable={editable} keyboardType="decimal-pad" selectTextOnFocus onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChangeText={next=>{setText(next);if(next === '' && placeholder)onChange(null);else if(/^-?\d+(?:\.\d*)?$/.test(next) && Number.isFinite(Number(next)))onChange(Number(next));}} style={s.input} /></View>;
}
