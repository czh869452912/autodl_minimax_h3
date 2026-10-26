import React from 'react';
import {act,create} from 'react-test-renderer';
import {AudioVersionPreview} from './AudioVersionPreview';
import type {AssetVersion} from './types';
const mockVerify=jest.fn(),mockPlay=jest.fn(),mockPause=jest.fn(),mockSeek=jest.fn(async()=>{});
const mockPlayer={play:mockPlay,pause:mockPause,seekTo:mockSeek};
jest.mock('./runtime',()=>({creativeFiles:()=>({verify:mockVerify})}));
jest.mock('expo-audio',()=>({useAudioPlayer:()=>mockPlayer,useAudioPlayerStatus:()=>({isLoaded:true,playing:false,duration:5,currentTime:5,didJustFinish:true})}));
jest.mock('expo-router',()=>({useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
const version:AssetVersion={id:'v',assetId:'a',source:'import',versionNo:1,state:'AVAILABLE',recipe:{},relativePath:'cas/audio',blobSha256:'hash',mime:'audio/mpeg'};
test('audio waits for verification, never autoplays, replays from start and pauses on exit',async()=>{
  mockVerify.mockResolvedValue({state:'AVAILABLE'});let tree!:ReturnType<typeof create>;
  try{
    await act(async()=>{tree=create(<AudioVersionPreview version={version}/>);});
    expect(mockPlay).not.toHaveBeenCalled();
    const button=tree.root.findAll(n=>n.props.accessibilityLabel==='播放音频'&&typeof n.props.onPress==='function')[0];
    await act(async()=>{button.props.onPress();});expect(mockSeek).toHaveBeenCalledWith(0);expect(mockPlay).toHaveBeenCalledTimes(1);
  }finally{act(()=>tree?.unmount());}
  expect(mockPause).toHaveBeenCalled();
});

test('unmount tolerates a native player already released by the audio hook',async()=>{
 mockVerify.mockResolvedValue({state:'AVAILABLE'});let tree!:ReturnType<typeof create>;
 await act(async()=>{tree=create(<AudioVersionPreview version={version}/>);});
 mockPause.mockImplementationOnce(()=>{throw new Error('Cannot use shared object that was already released');});
 expect(()=>act(()=>tree.unmount())).not.toThrow();
});
