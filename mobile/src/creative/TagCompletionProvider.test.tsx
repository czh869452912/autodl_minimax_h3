import React from 'react';
import {act,create} from 'react-test-renderer';
import {TextInput,NativeModules,View} from 'react-native';
import {TagCompletionProvider} from './TagCompletionProvider';
import {WeightedPromptInput} from './WeightedPromptInput';
import {localTags,officialTags} from './tagDictionary';
jest.mock('./tagDictionary',()=>({localTags:jest.fn(async()=>[{name:'blue_hair',source:'local'}]),officialTags:jest.fn(async()=>[]),rankSuggestions:(items:any[])=>items,rememberTag:jest.fn()}));
beforeEach(()=>{jest.useFakeTimers();jest.clearAllMocks();NativeModules.AutoDLMedia={focusedInputCaret:jest.fn(async()=>({y:300,height:20,composing:false}))};});
afterEach(()=>{jest.useRealTimers();delete NativeModules.AutoDLMedia;});
test('inline completion replaces the selected token preserving weight syntax',async()=>{
 let tree:any;const change=jest.fn();
 try{act(()=>{tree=create(<TagCompletionProvider><WeightedPromptInput model="nai-diffusion-5-full" value="1.2::blue ha::" onChangeText={change}/></TagCompletionProvider>);});
 jest.spyOn(tree.root.findAllByType(View)[0].instance,'measureInWindow').mockImplementation((cb:any)=>cb(0,0,400,800));
 const input=tree.root.findByType(TextInput);
 act(()=>{input.props.onFocus({});input.props.onSelectionChange({nativeEvent:{selection:{start:12,end:12}}});});
 // Correct position is immediately before the closing double colon.
 act(()=>input.props.onSelectionChange({nativeEvent:{selection:{start:11,end:11}}}));
 await act(async()=>{await jest.advanceTimersByTimeAsync(150);});
 const item=tree.root.findAll((n:any)=>n.props.accessibilityLabel==='补全标签 blue_hair'&&n.props.onPress)[0];expect(item).toBeTruthy();
 act(()=>item.props.onPress());expect(change).toHaveBeenCalledWith('1.2::blue hair::');
 }finally{act(()=>tree?.unmount());}
});
test('does not query while the native IME is composing',async()=>{
 NativeModules.AutoDLMedia.focusedInputCaret.mockResolvedValue({composing:true});let tree:any;
 try{act(()=>{tree=create(<TagCompletionProvider><WeightedPromptInput model="nai-diffusion-5-full" value="蓝头"/></TagCompletionProvider>);});const input=tree.root.findByType(TextInput);act(()=>{input.props.onFocus({});input.props.onSelectionChange({nativeEvent:{selection:{start:2,end:2}}});});await act(async()=>{await jest.advanceTimersByTimeAsync(600);});expect(localTags).not.toHaveBeenCalled();expect(officialTags).not.toHaveBeenCalled();}finally{act(()=>tree?.unmount());}
});
