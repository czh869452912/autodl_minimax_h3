import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Keyboard,Pressable,Text,View} from 'react-native';
import {AppIcon,type IconName} from '../ui/icons';
import {COLORS} from '../ui/theme';

export const primaryDestinations=[{id:'create',label:'创作',icon:'tune'},{id:'agent',label:'助手',icon:'smart_toy'},{id:'projects',label:'项目',icon:'list_alt'},{id:'assets',label:'素材',icon:'grid_view'}] as const;
type Guard=(proceed:()=>void)=>void;
const Context=createContext<{register:(id:string,guard:Guard)=>()=>void;leave:(id:string,proceed:()=>void)=>void}|undefined>(undefined);
export function PrimaryNavigationProvider({children}:{children:ReactNode}){
 const guards=useRef(new Map<string,Guard>());
 const value=useMemo(()=>({register:(id:string,guard:Guard)=>{guards.current.set(id,guard);return()=>{if(guards.current.get(id)===guard)guards.current.delete(id);};},leave:(id:string,proceed:()=>void)=>{const guard=guards.current.get(id);if(guard)guard(proceed);else proceed();}}),[]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePrimaryNavigationGuard(id:string,guard:Guard,enabled=true){
 const context=useContext(Context),live=useRef(guard);live.current=guard;
 useEffect(()=>enabled?context?.register(id,proceed=>live.current(proceed)):undefined,[context,id,enabled]);
}
type TabProps={state:{index:number;routes:Array<{name:string;key:string}>};navigation:{emit:(event:{type:'tabPress';target:string;canPreventDefault:true})=>{defaultPrevented:boolean};navigate:(name:string)=>void}};
export function PrimaryTabBar({state,navigation}:TabProps){
 const context=useContext(Context),[keyboard,setKeyboard]=useState(Keyboard.isVisible());
 useEffect(()=>{const show=Keyboard.addListener('keyboardDidShow',()=>setKeyboard(true)),hide=Keyboard.addListener('keyboardDidHide',()=>setKeyboard(false));return()=>{show.remove();hide.remove();};},[]);
 if(keyboard)return null;
 const current=state.routes[state.index].name;
 return <View accessibilityLabel="主导航" style={{flexDirection:'row',backgroundColor:COLORS.surface,borderTopWidth:1,borderColor:COLORS.border,paddingTop:6,paddingBottom:4}}>
  {primaryDestinations.map(item=><Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected:current===item.id}} onPress={()=>{
   if(current===item.id)return;
   const route=state.routes.find(r=>r.name===item.id);if(!route)return;
   const proceed=()=>{const event=navigation.emit({type:'tabPress',target:route.key,canPreventDefault:true});if(!event.defaultPrevented)navigation.navigate(item.id);};
   if(context)context.leave(current,proceed);else proceed();
  }} style={({pressed})=>({flex:1,minHeight:50,alignItems:'center',justifyContent:'center',gap:3,opacity:pressed?0.65:1})}>
   <AppIcon name={item.icon as IconName} size={22} color={current===item.id?COLORS.primary:COLORS.textMuted}/><Text style={{fontSize:11,fontWeight:current===item.id?'700':'500',color:current===item.id?COLORS.primary:COLORS.textMuted}}>{item.label}</Text>
  </Pressable>)}
 </View>;
}
