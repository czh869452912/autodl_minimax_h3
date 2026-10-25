import {useMemo} from 'react';
import {Text,TextInput,type TextInputProps} from 'react-native';

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
export function WeightedPromptInput({value='',...props}:Omit<TextInputProps,'value'|'children'> & {value?:string}){
  const runs=useMemo(()=>promptWeightRuns(value),[value]);
  return <TextInput {...props} multiline underlineColorAndroid="transparent">
    <Text>{runs.map((run,index)=><Text key={index} style={{backgroundColor:promptWeightColor(run.weight)}}>{run.text}</Text>)}</Text>
  </TextInput>;
}
