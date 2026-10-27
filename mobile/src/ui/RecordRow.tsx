import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppIcon } from './icons';
import { COLORS } from './theme';

/** A selection and a navigation row share density, not their semantics. */
export function RecordRow({ title, detail, meta, leading, trailing, selected, disabled, onPress }: {
  title: string; detail?: string; meta?: string; leading?: ReactNode; trailing?: ReactNode;
  selected?: boolean; disabled?: boolean; onPress: () => void;
}) {
  return <View style={{flexDirection:'row',alignItems:'center',borderBottomWidth:0.5,borderBottomColor:COLORS.border}}>
    <Pressable accessibilityRole={selected===undefined?'button':'radio'} accessibilityLabel={title} accessibilityHint={[detail,meta].filter(Boolean).join('，')} accessibilityState={{disabled,...(selected===undefined?{}:{checked:selected})}} disabled={disabled} onPress={onPress}
      style={({pressed})=>({flex:1,minHeight:64,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:10,paddingHorizontal:4,opacity:disabled?0.45:pressed?0.65:1})}>
      {leading}
      <View style={{flex:1,gap:4}}><Text numberOfLines={2} style={{fontSize:14,lineHeight:20,fontWeight:'600',color:COLORS.text}}>{title}</Text>
        {detail?<Text numberOfLines={2} style={{fontSize:12,lineHeight:18,color:COLORS.textMuted}}>{detail}</Text>:null}
        {meta?<Text numberOfLines={1} style={{fontSize:11,color:COLORS.textSubtle}}>{meta}</Text>:null}
      </View>
      <AppIcon name={selected?'check':'chevron_right'} size={18} color={selected?COLORS.primary:COLORS.textSubtle}/>
    </Pressable>
    {trailing}
  </View>;
}
