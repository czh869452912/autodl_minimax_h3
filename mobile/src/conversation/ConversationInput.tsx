import { useEffect, useState, type Ref } from 'react';
import { ActivityIndicator, Pressable, TextInput, type TextInputProps } from 'react-native';
import { COLORS } from '../ui/theme';
import { AppIcon } from '../ui/icons';

export function ConversationInput({ inputRef, style, value, ...props }: TextInputProps & {inputRef?:Ref<TextInput>}) {
  const [height,setHeight]=useState(40);
  useEffect(()=>{if(!value)setHeight(40);},[value]);
  return <TextInput ref={inputRef} value={value} multiline scrollEnabled textAlignVertical="top"
    placeholderTextColor={COLORS.textSubtle} selectionColor={COLORS.primary}
    onContentSizeChange={event=>setHeight(Math.max(40,Math.min(104,event.nativeEvent.contentSize.height)))}
    style={[{flex:1,height,paddingHorizontal:10,paddingVertical:8,fontSize:15,lineHeight:22,color:COLORS.text},style]} {...props}/>;
}

export function ConversationSend({running,busy,disabled,onSend,onStop}:{running:boolean;busy?:boolean;disabled?:boolean;onSend:()=>void;onStop:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={running?'停止本轮':busy?'发送中':'发送消息'} accessibilityState={{disabled:!running&&disabled,busy}} disabled={!running&&disabled} onPress={running?onStop:onSend}
    style={({pressed})=>({width:44,height:44,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:!running&&disabled?COLORS.surfaceRaised:COLORS.primary,opacity:pressed?0.7:1})}>
    {busy&&!running?<ActivityIndicator color={COLORS.textMuted}/>:<AppIcon name={running?'close':'send'} size={19} color={!running&&disabled?COLORS.textMuted:COLORS.onPrimary}/>}
  </Pressable>;
}
