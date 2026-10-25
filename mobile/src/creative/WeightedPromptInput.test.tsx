import React from 'react';
import {act,create} from 'react-test-renderer';
import {TextInput} from 'react-native';
import {WeightedPromptInput,promptWeightRuns,promptWeightColor} from './WeightedPromptInput';
test('weight spans preserve every character, Unicode and live incomplete groups',()=>{
  for(const source of ['1.5::光线::, 0.5::阴影::, 1.0::sky::','-2::blur::','1.5::未完成','plain\ntext','2::outer 0.5::inner:: outer::'])expect(promptWeightRuns(source).map(r=>r.text).join('')).toBe(source);
  expect(promptWeightRuns('2::outer 0.5::inner:: outer::').find(r=>r.text==='inner')?.weight).toBe(1);
  expect(promptWeightColor(1)).toBeUndefined();expect(promptWeightColor(1.5)).toContain('211,65,49');expect(promptWeightColor(0.5)).toContain('35,112,216');
  expect(promptWeightColor(2)).not.toEqual(promptWeightColor(1.1));
});
test('native editor emits unmodified input and uses a single text input for all styled spans',()=>{
  let tree!:ReturnType<typeof create>;const changed=jest.fn();
  try{act(()=>{tree=create(<WeightedPromptInput value="1.5::cat::" onChangeText={changed}/>);});
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    act(()=>tree.root.findByType(TextInput).props.onChangeText('0.5::中文::'));
    expect(changed).toHaveBeenCalledWith('0.5::中文::');
  }finally{act(()=>tree?.unmount());}
});
