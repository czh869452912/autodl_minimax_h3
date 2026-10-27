import {Pressable} from 'react-native';
import {AppIcon,type IconName} from './icons';
import {COLORS} from './theme';

/** Shared image-viewer controls: the same shape and icons in canvas and fullscreen. */
export function ImageOverlayAction({label,icon,onPress,dark=false}:{label:string;icon:IconName;onPress:()=>void;dark?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>({width:40,height:40,borderRadius:10,alignItems:'center',justifyContent:'center',borderWidth:0.5,borderColor:dark?'#46515a':COLORS.border,backgroundColor:dark?'#252c31':COLORS.surface,opacity:pressed?0.65:0.94})}><AppIcon name={icon} size={19} color={dark?'#e8edf0':COLORS.textMuted}/></Pressable>;
}
