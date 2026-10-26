import {useCallback,useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useAudioPlayer,useAudioPlayerStatus} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import {creativeFiles} from './runtime';
import type {AssetVersion} from './types';
import {ListAction} from '../ui/ListPageUI';
import {COLORS} from '../ui/theme';
function AudioPlayback({uri}:{uri:string}){
  const player=useAudioPlayer(uri),status=useAudioPlayerStatus(player),[error,setError]=useState('');
  useFocusEffect(useCallback(()=>()=>{
    // The audio hook may release its native shared object before focus cleanup on unmount.
    try{player.pause();}catch{/* Already released: playback has stopped with the player. */}
  },[player]));
  return <View style={{gap:8}}><Text style={{color:COLORS.textMuted}}>{Math.floor(status.currentTime??0)} / {Math.round(status.duration??0)} 秒</Text>
    <ListAction label={status.playing?'暂停试听':'播放音频'} secondary disabled={!status.isLoaded} onPress={()=>{void(async()=>{
      setError('');if(status.playing){player.pause();return;}
      if(status.didJustFinish||(status.duration>0&&status.currentTime>=status.duration))await player.seekTo(0);
      player.play();
    })().catch(()=>setError('无法播放，请保存原件后使用其他播放器打开。'));}}/>
    {!status.isLoaded?<Text style={{color:COLORS.textMuted}}>正在加载；若无法解码，可保存原件后打开。</Text>:null}
    {error||status.error?<Text accessibilityRole="alert" style={{color:COLORS.danger}}>{error||'音频解码失败，可保存原件后打开。'}</Text>:null}
  </View>;
}
export function AudioVersionPreview({version}:{version:AssetVersion}){
  const [ready,setReady]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let live=true;setReady(false);setError('');void creativeFiles().verify(version.id).then(result=>{
    if(!live)return;if(result?.state==='AVAILABLE')setReady(true);else setError('音频原件不可用，请恢复文件。');
  }).catch(()=>{if(live)setError('音频原件校验失败');});return()=>{live=false;};},[version.id,version.blobSha256]);
  return ready&&version.relativePath?<AudioPlayback key={version.id} uri={`${FileSystem.documentDirectory}${version.relativePath}`}/>:<Text style={{color:COLORS.textMuted}}>{error||'正在校验音频原件…'}</Text>;
}
