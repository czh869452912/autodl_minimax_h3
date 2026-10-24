import React from 'react';
import {act,create} from 'react-test-renderer';
import {PromptAssistSheet} from './PromptAssistSheet';
const mockSuggest=jest.fn(async()=> 'suggested prompt');
jest.mock('./promptSuggestion',()=>({suggestCreativePrompt:(...args:unknown[])=>mockSuggest(...args as [])}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()})}));
const press=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label && typeof n.props.onPress==='function')[0].props.onPress();
test('suggestions require explicit application and respect a concurrently changed draft',async()=>{
  const apply=jest.fn(),close=jest.fn();let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<PromptAssistSheet prompt="original" kind="image" onApply={apply} onClose={close} />);});
    await act(async()=>press(tree,'获取提示词建议'));
    expect(apply).not.toHaveBeenCalled();
    act(()=>tree.update(<PromptAssistSheet prompt="edited elsewhere" kind="image" onApply={apply} onClose={close} />));
    expect(tree.root.findAll(n=>n.props.accessibilityLabel==='应用到当前草稿' && n.props.disabled===true).length).toBeGreaterThan(0);
    act(()=>tree.update(<PromptAssistSheet prompt="original" kind="image" onApply={apply} onClose={close} />));
    act(()=>press(tree,'应用到当前草稿'));
    expect(apply).toHaveBeenCalledWith('suggested prompt');expect(close).toHaveBeenCalledTimes(1);
  }finally{act(()=>tree?.unmount());}
});
