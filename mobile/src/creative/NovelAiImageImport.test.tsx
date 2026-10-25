import React from 'react';
import {act,create} from 'react-test-renderer';
import {NativeModules} from 'react-native';
import {NovelAiImageImport} from './NovelAiImageImport';
import {defaultNovelAiDraft} from './novelAiProtocol';
test('picker URI metadata import applies selected text without importing a source or submitting generation',async()=>{
  const read=jest.fn(async()=>({Software:'NovelAI',Source:'NovelAI Diffusion V5 0ADF9AB7',Comment:JSON.stringify({prompt:'1.5::stars::',uc:'text',seed:0})}));
  NativeModules.AutoDLMedia={readCreativePngMetadata:read,readCreativeImageInfo:jest.fn(()=>{throw new Error('CAS only');})};
  const apply=jest.fn(),source=jest.fn(),close=jest.fn();let tree!:ReturnType<typeof create>;
  try{await act(async()=>{tree=create(<NovelAiImageImport image={{uri:'content://picker/photo',name:'photo.png',mimeType:'image/png',size:100}} input={defaultNovelAiDraft} onApply={apply} onUseImage={source} onClose={close}/>);});
    expect(read).toHaveBeenCalledWith('content://picker/photo');
    act(()=>tree.root.findAll(n=>n.props.accessibilityLabel==='导入所选元数据'&&n.props.onPress)[0].props.onPress());
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({prompt:'1.5::stars::',negative:'text'}));
    expect(apply.mock.calls[0][0].seed).toBeUndefined();expect(source).not.toHaveBeenCalled();expect(close).toHaveBeenCalled();
  }finally{act(()=>tree?.unmount());}
});
