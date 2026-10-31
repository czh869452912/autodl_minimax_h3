import React from 'react';
import {act,create} from 'react-test-renderer';
import {PromptChunkLibrary} from './PromptChunkLibrary';
import {defaultNovelAiDraft,prepareNovelAiRequest} from './novelAiProtocol';
let mockSaved:any[]=[];
jest.mock('./promptChunkStore',()=>({readPromptChunks:async()=>mockSaved,savePromptChunks:async(rows:any[])=>{mockSaved=rows;}}));
const button=(t:any,label:string)=>t.root.findAll((n:any)=>n.props.accessibilityLabel===label&&n.props.onPress)[0];
const field=(t:any,label:string)=>t.root.findAll((n:any)=>n.props.accessibilityLabel===label&&n.props.onChangeText)[0];
test('saved chunks survive a fresh draft and insert into UC with an immutable draft snapshot',async()=>{
 mockSaved=[];let t:any;const update=jest.fn(),setTab=jest.fn();
 const render=()=> <PromptChunkLibrary input={defaultNovelAiDraft} update={update} editable setTab={setTab}/>;
 try{await act(async()=>{t=create(render());});act(()=>field(t,'片段名称').props.onChangeText('style'));act(()=>field(t,'片段内容').props.onChangeText('watercolor'));await act(async()=>button(t,'保存到本机片段库').props.onPress());expect(mockSaved).toEqual([{name:'style',text:'watercolor'}]);act(()=>t.unmount());await act(async()=>{t=create(render());});act(()=>button(t,'负面').props.onPress());act(()=>button(t,'插入style').props.onPress());const patch=update.mock.calls.at(-1)[0];expect(patch.negative).toBe('!macro:style!');expect(setTab).toHaveBeenLastCalledWith('negative');mockSaved[0]={name:'style',text:'changed'};expect(JSON.parse(prepareNovelAiRequest({...defaultNovelAiDraft,prompt:'scene',...patch},()=>0).requestJson).parameters.negative_prompt).toContain('watercolor');}finally{act(()=>t?.unmount());}
});
test('rejects saving a library chunk with a draft-only dependency',async()=>{
 mockSaved=[];let t:any;const update=jest.fn();
 try{await act(async()=>{t=create(<PromptChunkLibrary input={{...defaultNovelAiDraft,chunks:[{name:'draftOnly',text:'watercolor'}]}} update={update} editable setTab={()=>{}}/>);});
 act(()=>field(t,'片段名称').props.onChangeText('nested'));
 act(()=>field(t,'片段内容').props.onChangeText('!macro:draftOnly!'));
 await act(async()=>button(t,'保存到本机片段库').props.onPress());
 expect(mockSaved).toEqual([]);expect(update).not.toHaveBeenCalled();
 expect(JSON.stringify(t.toJSON())).toContain('找不到片段：draftOnly');
 }finally{act(()=>t?.unmount());}
});
test('retains a saved chunk referenced by another library entry',async()=>{
 mockSaved=[{name:'base',text:'watercolor'},{name:'nested',text:'!macro:base!'}];let t:any;
 try{await act(async()=>{t=create(<PromptChunkLibrary input={defaultNovelAiDraft} update={()=>{}} editable setTab={()=>{}}/>);});
 await act(async()=>button(t,'从本机库移除base').props.onPress());
 expect(mockSaved).toHaveLength(2);expect(JSON.stringify(t.toJSON())).toContain('其他已保存片段仍引用此片段');
 }finally{act(()=>t?.unmount());}
});
