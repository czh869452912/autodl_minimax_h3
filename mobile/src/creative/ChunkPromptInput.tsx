import {useEffect,useState} from 'react';
import {Text,View,type TextInputProps} from 'react-native';
import {WeightedPromptInput} from './WeightedPromptInput';
import {TextAction} from './WorkbenchUI';
import {readPromptChunks} from './promptChunkStore';
import {expandPromptChunks,mergePromptChunks,type PromptChunk} from './promptChunks';
export function ChunkPromptInput({chunks,onChunks,value='',onChangeText,...props}:TextInputProps & {model:string;chunks:PromptChunk[];onChunks:(chunks:PromptChunk[])=>void}){
 const [saved,setSaved]=useState<PromptChunk[]>([]),[selection,setSelection]=useState({start:value.length,end:value.length}),[focused,setFocused]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;readPromptChunks().then(rows=>{if(live)setSaved(rows);}).catch(()=>undefined);return()=>{live=false;};},[focused]);
 const all=mergePromptChunks(saved,chunks),token=focused&&selection.start===selection.end?value.slice(0,selection.start).match(/@([^@,\n]*)$/):null;
 return <View><WeightedPromptInput {...props} value={value} onChangeText={onChangeText} onFocus={e=>{setFocused(true);props.onFocus?.(e);}} onBlur={e=>{setFocused(false);props.onBlur?.(e);}} onSelectionChange={e=>{setSelection(e.nativeEvent.selection);props.onSelectionChange?.(e);}}/>
 {token?all.filter(c=>c.name.toLowerCase().includes(token[1].toLowerCase())).slice(0,6).map(c=><TextAction key={c.name} label={`引用片段 ${c.name}`} disabled={props.editable===false} onPress={()=>{try{if(all.length>50)throw new Error('本次引用片段超过50个');expandPromptChunks(`!macro:${c.name}!`,all);onChunks(all);onChangeText?.(value.slice(0,selection.start-token[0].length)+`!macro:${c.name}!`+value.slice(selection.end));setFocused(false);setError('');}catch(e){setError((e as Error).message);}}}/>):null}
 {error?<Text accessibilityRole="alert">{error}</Text>:null}</View>;
}
