import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Keyboard,NativeModules,Pressable,Text,View} from 'react-native';
import {COLORS} from '../ui/theme';
import {localTags,officialTags,rankSuggestions,rememberTag,type TagSuggestion} from './tagDictionary';
type Request={owner:object;query:string;model:string;target:number|null;apply:(tag:string)=>void};
const Context=createContext<{show:(r:Request)=>void;hide:(owner:object)=>void}|null>(null);
export const useTagCompletion=()=>useContext(Context);
export function TagCompletionProvider({children}:{children:ReactNode}){
 const [request,setRequest]=useState<Request>(),[items,setItems]=useState<TagSuggestion[]>([]),[top,setTop]=useState(0),[visibleRows,setVisibleRows]=useState(0),[online,setOnline]=useState(true),[enabled,setEnabled]=useState(true);
 const root=useRef<View>(null),live=useRef(request);live.current=request;
 const api=useMemo(()=>({show:(r:Request)=>setRequest(r),hide:(owner:object)=>setRequest(old=>old?.owner===owner?undefined:old)}),[]);
 useEffect(()=>{const sub=Keyboard.addListener('keyboardDidHide',()=>setRequest(undefined));return()=>sub.remove();},[]);
 useEffect(()=>{
  setItems([]);if(!request||!enabled)return;let active=true,local:TagSuggestion[]=[];setTop(0);
  const valid=()=>active&&live.current===request;
  const position=()=>{void(async()=>{
   const caret=await NativeModules.AutoDLMedia?.focusedInputCaret?.(request.target);if(!valid()||!caret||caret.composing){if(valid())setVisibleRows(0);return;}
   root.current?.measureInWindow((_x,y,_w,height)=>{if(!valid())return;const available=Math.min(height,(Keyboard.metrics()?.screenY??(y+height))-y),line=caret.y-y;
    const above=Math.max(0,line-8),below=Math.max(0,available-line-caret.height-8);
    const up=above>=below,space=up?above:below,rows=Math.max(0,Math.min(4,Math.floor((space-36)/32)));
    setVisibleRows(rows);setTop(up?Math.max(0,line-8-(36+32*rows)):line+caret.height+8);
   });
  })().catch(()=>{if(valid())setVisibleRows(0);});};
  position();const tracking=setInterval(position,200);
  const timer=setTimeout(()=>{void(async()=>{
   const caret=await NativeModules.AutoDLMedia?.focusedInputCaret?.(request.target);
   if(!valid()||caret?.composing)return;

   local=await localTags(request.query);if(valid())setItems(rankSuggestions(local,request.query));
  })().catch(()=>undefined);},120);
  const remote=setTimeout(()=>{if(!online)return;void(async()=>{const caret=await NativeModules.AutoDLMedia?.focusedInputCaret?.(request.target);if(!valid()||caret?.composing)return;const result=await officialTags(request.model,request.query);if(valid())setItems(rankSuggestions([...local,...result],request.query));})().catch(()=>undefined);},450);
  return()=>{active=false;clearInterval(tracking);clearTimeout(timer);clearTimeout(remote);};
 },[request,online,enabled]);
 return <Context.Provider value={api}><View ref={root} collapsable={false} style={{flex:1}}>{children}
 {request&&items.length>0&&enabled&&visibleRows>0?<View style={{position:'absolute',left:12,right:12,top,zIndex:100,elevation:20,borderRadius:10,borderWidth:1,borderColor:COLORS.border,backgroundColor:COLORS.surface,shadowOpacity:0.15,shadowRadius:8}}>
 <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:8,height:36}}><Text style={{flex:1,fontSize:11,color:COLORS.textMuted}}>标签补全</Text><Pressable accessibilityLabel="切换在线标签建议" onPress={()=>setOnline(!online)} style={{padding:8}}><Text style={{fontSize:11,color:COLORS.primary}}>{online?'官方＋离线':'仅离线'}</Text></Pressable><Pressable accessibilityLabel="本次关闭标签补全" onPress={()=>{setEnabled(false);setItems([]);}} style={{padding:8}}><Text style={{color:COLORS.textMuted}}>×</Text></Pressable></View>
 {items.slice(0,visibleRows).map(item=><Pressable key={item.name} accessibilityLabel={`补全标签 ${item.name}`} onPress={()=>{if(live.current!==request)return;rememberTag(item.name);request.apply(item.name);setRequest(undefined);}} style={{height:32,paddingHorizontal:10,paddingVertical:5,flexDirection:'row',gap:8}}><Text numberOfLines={1} style={{flex:1,color:COLORS.text,fontSize:13}}>{item.name.replaceAll('_',' ')}{item.translation?` · ${item.translation}`:''}</Text><Text style={{fontSize:10,color:COLORS.textMuted}}>{item.source==='official'?'官方':({0:'标签',1:'画师',3:'作品',4:'角色',5:'其他'} as Record<number,string>)[item.category??0]}</Text></Pressable>)}
 </View>:null}</View></Context.Provider>;
}
