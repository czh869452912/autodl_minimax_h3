import {Image,Text,Pressable,View} from 'react-native';
import {GestureDetector,GestureHandlerRootView} from 'react-native-gesture-handler';
import {useImageGestures} from './useImageGestures';

export function ZoomableImage({uri,identity,label,onOpen,originalUri,showOriginal=false}:{uri:string;identity:string;label:string;onOpen:()=>void;originalUri?:string;showOriginal?:boolean}){
  const zoom=useImageGestures({identity,onTap:onOpen}),{scale,x,y}=zoom.transform;
  return <GestureHandlerRootView style={{flex:1,minHeight:0}}>
    <GestureDetector gesture={zoom.gesture}><View collapsable={false} onLayout={zoom.onLayout} style={{flex:1,overflow:'hidden'}}>
      <View pointerEvents="none" style={{flex:1,transform:[{translateX:x},{translateY:y},{scale}]}}>
        <Image fadeDuration={0} accessibilityLabel={label} source={{uri}} resizeMode="contain" style={{flex:1,width:'100%'}}/>
        {originalUri?<Image fadeDuration={0} testID="result-original-overlay" accessible={false} source={{uri:originalUri}} resizeMode="contain" style={{position:'absolute',inset:0,opacity:showOriginal?1:0}}/>:null}
      </View>
    </View></GestureDetector>
    {scale>1?<Pressable accessibilityRole="button" accessibilityLabel="还原预览缩放" onPress={()=>zoom.update(1)} style={{position:'absolute',left:8,bottom:8,padding:10,borderRadius:16,backgroundColor:'#263238dd'}}><Text style={{color:'#fff',fontSize:12}}>{Math.round(scale*100)}% · 还原</Text></Pressable>:null}
    <Pressable accessibilityRole="button" accessibilityLabel="全屏查看图片" onPress={onOpen} style={{position:'absolute',right:8,top:8,padding:10,borderRadius:16,backgroundColor:'#263238dd'}}><Text style={{color:'#fff',fontSize:12}}>全屏</Text></Pressable>
  </GestureHandlerRootView>;
}
