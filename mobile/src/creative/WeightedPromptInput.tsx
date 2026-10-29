import {useTagCompletion} from './TagCompletionProvider';
import {completionToken,replaceCompletion} from './tagCompletion';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Text,TextInput,NativeModules,findNodeHandle,type TextInputProps} from 'react-native';

export function promptWeightRuns(value:string){
  const runs:Array<{text:string;weight:number}>=[],stack=[1];
  const token=/(?<!\\)(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)::|::)/g;
  let start=0,match:RegExpExecArray|null;
  const add=(text:string,weight:number)=>{if(text)runs.push({text,weight});};
  while((match=token.exec(value))){
    add(value.slice(start,match.index),stack[stack.length-1]);
    if(match[0]==='::'){
      add(match[0],stack[stack.length-1]);if(stack.length>1)stack.pop();
    }else{
      const weight=Number(match[0].slice(0,-2))*stack[stack.length-1];
      stack.push(Number.isFinite(weight)?weight:1);add(match[0],stack[stack.length-1]);
    }
    start=token.lastIndex;
  }
  add(value.slice(start),stack[stack.length-1]);return runs;
}
export function promptWeightColor(weight:number){
  if(weight===1)return undefined;
  const opacity=Math.min(0.65,0.12+Math.abs(weight-1)*0.56);
  return weight>1?`rgba(211,65,49,${opacity})`:`rgba(35,112,216,${opacity})`;
}

/** Styled native text spans keep selection, multiline editing and IME composition in one input. */
export function WeightedPromptInput({value='',model,...props}:Omit<TextInputProps,'value'|'children'> & {value?:string;model?:string}){
  const runs=useMemo(()=>promptWeightRuns(value),[value]),completion=useTagCompletion(),owner=useRef({}).current,input=useRef<TextInput>(null);
  const [focused,setFocused]=useState(false),[selection,setSelection]=useState({start:0,end:0}),[replacement,setReplacement]=useState<{start:number;end:number}>();
  const accepted=useRef<string|undefined>(undefined),pending=useRef<{text:string;caret:number}|undefined>(undefined);
  const live=useRef({value,selection});live.current={value,selection};
  useEffect(()=>{
    if(!completion||!model||!focused||props.editable===false)return;
    if(accepted.current===value){completion.hide(owner);return;}
    const token=completionToken(value,selection);if(!token){completion.hide(owner);return;}
    completion.show({owner,query:token.query,model,target:findNodeHandle(input.current),apply:tag=>{
      if(live.current.value!==value||live.current.selection.start!==selection.start||live.current.selection.end!==selection.end)return;
      const next=replaceCompletion(value,token,tag);
      if(props.maxLength!=null&&next.text.length>props.maxLength)return;
      accepted.current=next.text;pending.current=next;
      const native=NativeModules.AutoDLMedia?.replaceFocusedPrompt,target=findNodeHandle(input.current);
      if(native && target!=null){
        void native(target,value,selection.start,selection.end,next.text,next.caret).then((applied:boolean)=>{if(!applied){pending.current=undefined;accepted.current=undefined;}}).catch(()=>{pending.current=undefined;accepted.current=undefined;});
      }else{
        props.onChangeText?.(next.text);setSelection({start:next.caret,end:next.caret});setReplacement({start:next.caret,end:next.caret});input.current?.focus();
      }
    }});
    return()=>completion.hide(owner);
  },[value,selection,focused,model,props.editable,completion,owner]);
  return <TextInput {...props} ref={input} multiline underlineColorAndroid="transparent" selection={replacement??props.selection}
    onFocus={event=>{setFocused(true);props.onFocus?.(event);}} onBlur={event=>{setFocused(false);completion?.hide(owner);props.onBlur?.(event);}}
    onChangeText={text=>{if(pending.current?.text!==text){pending.current=undefined;accepted.current=undefined;setReplacement(undefined);}props.onChangeText?.(text);}}
    onSelectionChange={event=>{
      const next=event.nativeEvent.selection,expected=pending.current;
      if(expected){if(next.start!==expected.caret||next.end!==expected.caret)return;pending.current=undefined;}
      setReplacement(undefined);setSelection(next);props.onSelectionChange?.(event);
    }}>
    <Text>{runs.map((run,index)=><Text key={index} style={{backgroundColor:promptWeightColor(run.weight)}}>{run.text}</Text>)}</Text>
  </TextInput>;
}
