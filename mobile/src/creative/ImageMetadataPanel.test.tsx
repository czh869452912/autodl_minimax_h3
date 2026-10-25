import React from 'react';
import {act,create} from 'react-test-renderer';
import {NativeModules} from 'react-native';
import {ImageMetadataPanel,imageMetadataFields} from './ImageMetadataPanel';
import * as Clipboard from 'expo-clipboard';
import type {AssetVersion} from './types';
import {SegmentedChoices} from './WorkbenchUI';
jest.mock('./runtime',()=>({creativeFiles:()=>({verify:async()=>({state:'AVAILABLE'})})}));
jest.mock('expo-clipboard',()=>({setStringAsync:jest.fn(async()=>{})}));
const version:AssetVersion={id:'version',assetId:'asset',source:'generated',versionNo:2,state:'AVAILABLE',relativePath:'image.png',mime:'image/png',blobSha256:'a'.repeat(64),recipe:{input:{prompt:'App prompt',seed:77,width:832,height:1216},output:{width:1664,height:2432},operation:'upscale'}};
const button=(tree:ReturnType<typeof create>,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label && typeof n.props.onPress==='function')[0];

test('Inspect separates original Comment from app recipe and preserves raw values and whitespace on copy',async()=>{
 const comment='{"sampler":"k_euler_ancestral", "noise_schedule":"karras", "seed":0,"n_samples":1,"sm":false,"reference":null}';
 NativeModules.AutoDLMedia={readCreativeImageInfo:jest.fn(async()=>({width:832,height:1216,bytes:100,mime:'image/png',metadata:{Comment:comment}}))};
 let tree!:ReturnType<typeof create>;
 try{
  await act(async()=>{tree=create(<ImageMetadataPanel version={version}/>);});
  await act(async()=>button(tree,'查看图片元数据').props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('k_euler_ancestral (karras)');
  act(()=>tree.root.findByType(SegmentedChoices).props.onChange('raw'));
  await act(async()=>button(tree,'复制原始参数').props.onPress());
  expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(comment);
  expect(JSON.stringify(tree.toJSON())).not.toContain('App prompt');
 }finally{act(()=>tree?.unmount());}
});
test('metadata sheet shows actual dimensions separately from generation recipe and copies exact prompt',async()=>{
  const raw={Software:'NovelAI',Comment:JSON.stringify({prompt:'Embedded 中文 prompt',seed:33,width:832,height:1216})};
  NativeModules.AutoDLMedia={readCreativeImageInfo:jest.fn(async()=>({width:1664,height:2432,bytes:6491026,mime:'image/png',metadata:raw}))};
  let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageMetadataPanel version={version} />);});
    expect(NativeModules.AutoDLMedia.readCreativeImageInfo).not.toHaveBeenCalled();
    await act(async()=>{button(tree,'查看图片元数据').props.onPress();});
    const text=JSON.stringify(tree.toJSON());expect(text).toContain('1664');expect(text).toContain('2432');expect(text).toContain('832 × 1216');expect(text).toContain('独立超分');

    await act(async()=>{button(tree,'复制正面提示词').props.onPress();});
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Embedded 中文 prompt');
    act(()=>button(tree,'查看原始元数据与配方').props.onPress());
    await act(async()=>button(tree,'复制完整元数据与配方').props.onPress());
    const copied=JSON.parse((Clipboard.setStringAsync as jest.Mock).mock.calls.at(-1)[0]);expect(copied.embedded).toEqual(raw);expect(copied.recipe).toEqual(version.recipe);
  }finally{act(()=>tree?.unmount());}
});
test('missing original still exposes saved metadata without pretending to read the file',async()=>{
  NativeModules.AutoDLMedia={readCreativeImageInfo:jest.fn()};let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageMetadataPanel version={{...version,state:'MISSING'}} />);});
    await act(async()=>button(tree,'查看图片元数据').props.onPress());
    expect(NativeModules.AutoDLMedia.readCreativeImageInfo).not.toHaveBeenCalled();expect(JSON.stringify(tree.toJSON())).toContain('原件待恢复');expect(JSON.stringify(tree.toJSON())).toContain('App prompt');
  }finally{act(()=>tree?.unmount());}
});
test('malformed embedded JSON remains inspectable and zero-valued parameters are visible',()=>{
  const fields=imageMetadataFields({Comment:'broken'}, {input:{prompt:'saved',seed:0,rescale:0}});
  expect(fields).toEqual(expect.arrayContaining([{label:'正面提示词',value:'saved'},{label:'Seed',value:'0'},{label:'Rescale',value:'0'}]));
});

test('reusing a seed changes only the next input and never rewrites the saved recipe',async()=>{
  NativeModules.AutoDLMedia={readCreativeImageInfo:jest.fn(async()=>({width:832,height:1216,bytes:100,mime:'image/png',metadata:{Comment:JSON.stringify({seed:0,prompt:'embedded'})}}))};
  const reuse=jest.fn(),snapshot=JSON.stringify(version.recipe);let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<ImageMetadataPanel version={version} onReuse={reuse} />);});
    await act(async()=>button(tree,'查看图片元数据').props.onPress());
    act(()=>button(tree,'仅复用 Seed').props.onPress());
    expect(reuse).toHaveBeenCalledWith({seed:0});
    expect(JSON.stringify(version.recipe)).toBe(snapshot);
    expect(button(tree,'仅复用 Seed')).toBeUndefined();
  }finally{act(()=>tree?.unmount());}
});
