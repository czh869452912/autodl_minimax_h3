import React from 'react';
import {act,create} from 'react-test-renderer';
import {VideoReferenceCards} from './VideoReferenceCards';
import {AudioVersionPreview} from './AudioVersionPreview';
jest.mock('./AudioVersionPreview',()=>({AudioVersionPreview:()=>null}));
const rows=['a','b'].map(version_id=>({version_id,relative_path:version_id+'.mp3',mime:'audio/mpeg',byte_size:1000,state:'AVAILABLE',blob_sha256:version_id}));
test('only one selected audio is mounted; leaving editor stops it; menu removes only the chosen reference',()=>{
 let tree!:ReturnType<typeof create>;const replace=jest.fn();
 const render=(active=true)=><VideoReferenceCards active={active} kind="audio" rows={rows} minimum={0} maximum={3} editable onAdd={()=>{}} onPreview={()=>{}} onReplace={replace}/>;
 try{
  act(()=>{tree=create(render());});
  const button=(label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&n.props.onPress)[0];
  expect(tree.root.findAllByType(AudioVersionPreview)).toHaveLength(0);
  act(()=>button('试听音频 1').props.onPress());
  expect(tree.root.findByType(AudioVersionPreview).props.version.id).toBe('a');
  act(()=>button('试听音频 2').props.onPress());
  expect(tree.root.findAllByType(AudioVersionPreview)).toHaveLength(1);
  expect(tree.root.findByType(AudioVersionPreview).props.version.id).toBe('b');
  act(()=>tree.update(render(false)));
  expect(tree.root.findAllByType(AudioVersionPreview)).toHaveLength(0);
  act(()=>button('管理参考音频 2').props.onPress());
  act(()=>button('移除引用').props.onPress());
  expect(replace).toHaveBeenCalledWith(['a']);
 }finally{act(()=>tree?.unmount());}
});
