import {Image,View} from 'react-native';
import {GestureDetector,GestureHandlerRootView} from 'react-native-gesture-handler';
import {ImageOverlayAction} from './ImageOverlayAction';
import {useImageGestures} from './useImageGestures';

export function ZoomableImage({uri,identity,label,onOpen,originalUri,showOriginal=false}:{uri:string;identity:string;label:string;onOpen:()=>void;originalUri?:string;showOriginal?:boolean}){
  const zoom=useImageGestures({identity}),{scale,x,y}=zoom.transform;
  return <GestureHandlerRootView style={{flex:1,minHeight:0}}>
    <GestureDetector gesture={zoom.gesture}><View collapsable={false} onLayout={zoom.onLayout} style={{flex:1,overflow:'hidden'}}>
      <View pointerEvents="none" style={{flex:1,transform:[{translateX:x},{translateY:y},{scale}]}}>
        <Image fadeDuration={0} accessibilityLabel={label} source={{uri}} resizeMode="contain" style={{flex:1,width:'100%'}}/>
        {originalUri?<Image fadeDuration={0} testID="result-original-overlay" accessible={false} source={{uri:originalUri}} resizeMode="contain" style={{position:'absolute',inset:0,opacity:showOriginal?1:0}}/>:null}
      </View>
    </View></GestureDetector>
    <View style={{position:'absolute',right:8,top:8,flexDirection:'row',gap:6}}>
      {scale>1?<ImageOverlayAction label="还原预览缩放" icon="refresh" onPress={()=>zoom.update(1)}/>:null}
      <ImageOverlayAction label="全屏查看图片" icon="open_in_full" onPress={onOpen}/>
    </View>
  </GestureHandlerRootView>;
}
