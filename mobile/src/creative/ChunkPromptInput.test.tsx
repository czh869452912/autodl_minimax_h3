import React from 'react';
import {act,create} from 'react-test-renderer';
import {ChunkPromptInput} from './ChunkPromptInput';
import {WeightedPromptInput} from './WeightedPromptInput';
jest.mock('./WeightedPromptInput',()=>({WeightedPromptInput:()=>null}));
jest.mock('./promptChunkStore',()=>({readPromptChunks:async()=>[{name:'style',text:'watercolor'}]}));
test('@ completion replaces the cursor token and snapshots its definition',async()=>{
 let tree:any;const onChangeText=jest.fn(),onChunks=jest.fn();
 try{
 await act(async()=>{tree=create(<ChunkPromptInput model="nai-diffusion-4-5-full" value="scene, @sty, sunset" chunks={[]} onChunks={onChunks} onChangeText={onChangeText}/>);});
 await act(async()=>tree.root.findByType(WeightedPromptInput).props.onFocus({}));
 act(()=>tree.root.findByType(WeightedPromptInput).props.onSelectionChange({nativeEvent:{selection:{start:11,end:11}}}));
 const button=tree.root.findAll((n:any)=>n.props.accessibilityLabel==='引用片段 style'&&n.props.onPress)[0];
 act(()=>button.props.onPress());
 expect(onChangeText).toHaveBeenCalledWith('scene, !macro:style!, sunset');
 expect(onChunks).toHaveBeenCalledWith([{name:'style',text:'watercolor'}]);
 }finally{act(()=>tree?.unmount());}
});
