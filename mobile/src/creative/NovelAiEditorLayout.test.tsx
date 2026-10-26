import React from 'react';
import {act,create} from 'react-test-renderer';
import {TextInput} from 'react-native';
import {NovelAiPromptEditor} from './NovelAiPromptEditor';
import {NovelAiSettings} from './NovelAiSettings';
import {defaultNovelAiDraft} from './novelAiProtocol';
const button=(tree:any,label:string)=>tree.root.findAll((n:any)=>n.props.accessibilityLabel===label&&n.props.onPress)[0];
test('final prompt preview is restricted to prompt tabs even after expanding it',()=>{
 let tree:any;const props={input:defaultNovelAiDraft,update:jest.fn(),editable:true,setTab:jest.fn(),onClose:jest.fn(),references:null,onAssist:jest.fn(),inline:true};
 try{act(()=>{tree=create(<NovelAiPromptEditor {...props} tab="prompt"/>);});act(()=>button(tree,'查看最终提示词').props.onPress());
 for(const tab of ['references','chunks']){act(()=>tree.update(<NovelAiPromptEditor {...props} tab={tab}/>));expect(button(tree,'查看最终提示词')).toBeUndefined();expect(button(tree,'收起最终提示词')).toBeUndefined();expect(tree.root.findAll((n:any)=>n.props.children==='实际发送的描述')).toHaveLength(0);}
 }finally{act(()=>tree?.unmount());}
});
test('common settings are directly editable and size groups retain orientation',()=>{
 let tree:any;const update=jest.fn();
 try{act(()=>{tree=create(<NovelAiSettings input={defaultNovelAiDraft} editable update={update} onClose={()=>{}} inline/>);});
 expect(tree.root.findAllByType(TextInput).some((n:any)=>n.props.accessibilityLabel==='步数')).toBe(true);
 expect(button(tree,'Euler Ancestral')).toBeTruthy();
 expect(tree.root.findAllByType(TextInput).some((n:any)=>n.props.accessibilityLabel==='Rescale')).toBe(false);
 act(()=>button(tree,'标准').props.onPress());act(()=>button(tree,'大尺寸').props.onPress());expect(update).toHaveBeenLastCalledWith({width:1472,height:2112});
 act(()=>button(tree,'高级设置').props.onPress());expect(tree.root.findAllByType(TextInput).some((n:any)=>n.props.accessibilityLabel==='Rescale')).toBe(true);
 }finally{act(()=>tree?.unmount());}
});

test('scrolling vertically across a slider does not change a generation parameter',()=>{
 const {NovelAiRangeField}=require('./NovelAiRangeField');let tree:any;const change=jest.fn();
 try{act(()=>{tree=create(<NovelAiRangeField label="步数" value={23} min={1} max={50} step={1} editable onChange={change}/>);});
 const slider=tree.root.findAll((n:any)=>n.props.accessibilityLabel==='步数 滑块'&&n.props.onResponderGrant)[0];
 const event=(x:number,y:number)=>({nativeEvent:{pageX:x,pageY:y,locationX:x}});
 act(()=>slider.props.onLayout({nativeEvent:{layout:{width:200}}}));
 act(()=>slider.props.onResponderGrant(event(100,100)));act(()=>slider.props.onResponderMove(event(100,50)));act(()=>slider.props.onResponderRelease(event(100,50)));expect(change).not.toHaveBeenCalled();
 act(()=>slider.props.onResponderGrant(event(100,100)));act(()=>slider.props.onResponderMove(event(150,100)));act(()=>slider.props.onResponderRelease(event(150,100)));expect(change).toHaveBeenLastCalledWith(38);
 }finally{act(()=>tree?.unmount());}
});
