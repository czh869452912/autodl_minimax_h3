import React from 'react';
import {act,create} from 'react-test-renderer';
import {TextInput,NativeModules,View,ScrollView} from 'react-native';
import {TagCompletionProvider,TagCompletionToggle} from './TagCompletionProvider';
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
 act(()=>input.props.onSelectionChange({nativeEvent:{selection:{start:12,end:12}}}));
 await act(async()=>{await jest.advanceTimersByTimeAsync(150);});
 const item=tree.root.findAll((n:any)=>n.props.accessibilityLabel==='补全标签 blue_hair'&&n.props.onPress)[0];expect(item).toBeTruthy();
 act(()=>item.props.onPress());expect(change).toHaveBeenCalledWith('1.2::blue hair::');
 }finally{act(()=>tree?.unmount());}
});
test('does not query while the native IME is composing',async()=>{
 NativeModules.AutoDLMedia.focusedInputCaret.mockResolvedValue({composing:true});let tree:any;
 try{act(()=>{tree=create(<TagCompletionProvider><WeightedPromptInput model="nai-diffusion-5-full" value="蓝头"/></TagCompletionProvider>);});const input=tree.root.findByType(TextInput);act(()=>{input.props.onFocus({});input.props.onSelectionChange({nativeEvent:{selection:{start:2,end:2}}});});await act(async()=>{await jest.advanceTimersByTimeAsync(600);});expect(localTags).not.toHaveBeenCalled();expect(officialTags).not.toHaveBeenCalled();}finally{act(()=>tree?.unmount());}
});
test('completion can be enabled again after closing the popup without remounting the editor',async()=>{
 let tree:any;
 try{
  act(()=>{tree=create(<TagCompletionProvider><TagCompletionToggle/><WeightedPromptInput model="nai-diffusion-5-full" value="blue ha"/></TagCompletionProvider>);});
  jest.spyOn(tree.root.findAllByType(View)[0].instance,'measureInWindow').mockImplementation((cb:any)=>cb(0,0,400,800));
  const button=(label:string)=>tree.root.findAll((n:any)=>n.props.accessibilityLabel===label&&n.props.onPress)[0];
  const input=tree.root.findByType(TextInput);
  act(()=>{input.props.onFocus({});input.props.onSelectionChange({nativeEvent:{selection:{start:7,end:7}}});});
  await act(async()=>{await jest.advanceTimersByTimeAsync(150);});
  act(()=>button('本次关闭标签补全').props.onPress());
  expect(button('标签补全').props.accessibilityState.checked).toBe(false);
  expect(button('补全标签 blue_hair')).toBeUndefined();
  act(()=>button('标签补全').props.onPress());
  await act(async()=>{await jest.advanceTimersByTimeAsync(150);});
  expect(button('补全标签 blue_hair')).toBeTruthy();
 }finally{act(()=>tree?.unmount());}
});


test('all candidates stay in a bounded scroll view and the eighth can be chosen',async()=>{
 (localTags as jest.Mock).mockResolvedValueOnce(Array.from({length:12},(_,i)=>({name:'blue_'+i,source:'local'})));
 let tree:any;const change=jest.fn();
 try{
  act(()=>{tree=create(<TagCompletionProvider><WeightedPromptInput model="test" value="blue" onChangeText={change}/></TagCompletionProvider>);});
  jest.spyOn(tree.root.findAllByType(View)[0].instance,'measureInWindow').mockImplementation((cb:any)=>cb(0,0,400,800));
  const input=tree.root.findByType(TextInput);act(()=>{input.props.onFocus({});input.props.onSelectionChange({nativeEvent:{selection:{start:4,end:4}}});});
  await act(async()=>{await jest.advanceTimersByTimeAsync(150);});
  const list=tree.root.findByType(ScrollView);expect(list.props.persistentScrollbar).toBe(true);expect(list.props.keyboardShouldPersistTaps).toBe('always');expect(list.props.style.height).toBeLessThanOrEqual(128);
  const item=tree.root.findAll((n:any)=>n.props.accessibilityLabel==='补全标签 blue_7'&&n.props.onPress)[0];act(()=>item.props.onPress());
  expect(change).toHaveBeenCalledWith('blue 7, ');
  act(()=>input.props.onSelectionChange({nativeEvent:{selection:{start:4,end:4}}}));
  expect(tree.root.findByType(TextInput).props.selection).toEqual({start:8,end:8});
  act(()=>input.props.onSelectionChange({nativeEvent:{selection:{start:8,end:8}}}));
  expect(tree.root.findByType(TextInput).props.selection).toBeUndefined();
 }finally{act(()=>tree?.unmount());}
});


test('Android commits text and UTF-16 selection together and stale native selection events cannot move the accepted caret',async()=>{
 const handle=jest.spyOn(require('react-native'),'findNodeHandle').mockReturnValue(42);
 NativeModules.AutoDLMedia.replaceFocusedPrompt=jest.fn(async()=>true);
 let tree:any;const change=jest.fn(),selected=jest.fn();
 const value='🌌, blue ha extra, sky',caret=value.indexOf(' extra');
 try{
  act(()=>{tree=create(<TagCompletionProvider><WeightedPromptInput model="test" value={value} onChangeText={change} onSelectionChange={selected}/></TagCompletionProvider>);});
  jest.spyOn(tree.root.findAllByType(View)[0].instance,'measureInWindow').mockImplementation((cb:any)=>cb(0,0,400,800));
  const input=tree.root.findByType(TextInput);act(()=>{input.props.onFocus({});input.props.onSelectionChange({nativeEvent:{selection:{start:caret,end:caret}}});});
  await act(async()=>{await jest.advanceTimersByTimeAsync(150);});
  await act(async()=>tree.root.findAll((n:any)=>n.props.accessibilityLabel==='补全标签 blue_hair'&&n.props.onPress)[0].props.onPress());
  expect(NativeModules.AutoDLMedia.replaceFocusedPrompt).toHaveBeenCalledWith(42,value,caret,caret,'🌌, blue hair, extra, sky',15);
  expect(change).not.toHaveBeenCalled();selected.mockClear();
  act(()=>input.props.onSelectionChange({nativeEvent:{selection:{start:20,end:20}}}));expect(selected).not.toHaveBeenCalled();
  act(()=>{input.props.onChangeText('🌌, blue hair, extra, sky');input.props.onSelectionChange({nativeEvent:{selection:{start:15,end:15}}});});
  expect(change).toHaveBeenCalledTimes(1);expect(selected).toHaveBeenCalledTimes(1);
 }finally{act(()=>tree?.unmount());handle.mockRestore();}
});
