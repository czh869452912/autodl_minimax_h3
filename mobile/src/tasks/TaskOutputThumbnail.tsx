import {extractPoster} from '../native/media';
import {previewQueue} from '../creative/previewQueue';
import {useEffect,useState} from 'react';
import {Image,Text,View} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {getDatabase} from '../storage/databaseClient';
import {AppIcon} from '../ui/icons';
import {COLORS} from '../ui/theme';
export function TaskOutputThumbnail({id,updatedAt,thumbnailUrl,video=false}:{id:string;updatedAt:number;thumbnailUrl?:string;video?:boolean}){
 const [path,setPath]=useState<string>(),[delivery,setDelivery]=useState<string>();
 useEffect(()=>{let release:(()=>void)|undefined;let active=true,attempts=0,timer:ReturnType<typeof setTimeout>|undefined;setPath(undefined);setDelivery(undefined);const refresh=async()=>{
  try{const row=await getDatabase().getFirstAsync<{relative_path:string;sha256:string}>("SELECT b.relative_path,b.sha256 FROM creative_output_links l JOIN creative_version_files f ON f.version_id=l.version_id AND f.role='original' AND f.state='AVAILABLE' JOIN artifact_blobs b ON b.sha256=f.blob_sha256 WHERE l.job_id=? AND b.mime LIKE ? ORDER BY l.version_id LIMIT 1",id,video?'video/%':'image/%');const saved=await getDatabase().getFirstAsync<{status:string}>("SELECT d.status FROM creative_output_links l JOIN creative_deliveries d ON d.version_id=l.version_id WHERE l.job_id=? ORDER BY d.updated_at DESC LIMIT 1",id);if(!active)return;let image=row?.relative_path?FileSystem.documentDirectory+row.relative_path:undefined;
 if(video){const legacy=!row?await getDatabase().getFirstAsync<{local_uri:string;thumbnail_url:string}>('SELECT local_uri,thumbnail_url FROM tasks WHERE id=? LIMIT 1',id):undefined;if(!active)return;const source=image??legacy?.local_uri;image=legacy?.thumbnail_url??thumbnailUrl;if(source){const request=previewQueue.request('task-poster:'+(row?.sha256??source),()=>extractPoster(source,'creative-preview:'+(row?.sha256??id)));release?.();release=request.release;image=await request.promise;}}
 if(active){setPath(image);setDelivery(saved?.status);if(attempts++<20 && (!image||saved && ['QUEUED','PUBLISHING'].includes(saved.status)))timer=setTimeout(()=>void refresh(),3000);}}catch{}
 };void refresh();return()=>{active=false;release?.();if(timer)clearTimeout(timer);};},[id,updatedAt,video,thumbnailUrl]);
 return <View style={{width:56,height:64,borderRadius:8,overflow:'hidden',backgroundColor:COLORS.surfaceRaised,alignItems:'center',justifyContent:'center'}}>{path||thumbnailUrl?<Image accessibilityLabel="任务结果缩略图" source={{uri:path??thumbnailUrl}} resizeMode="cover" style={{width:'100%',height:'100%'}}/>:<AppIcon name={video?"movie_filter":"image"} size={22}/>}{delivery?<Text style={{position:'absolute',bottom:0,left:0,right:0,textAlign:'center',fontSize:9,color:'#fff',backgroundColor:delivery==='FAILED'?COLORS.danger:'rgba(0,0,0,0.65)'}}>{({EXPORTED:'已存相册',FAILED:'保存失败',QUEUED:'等待保存',PUBLISHING:'保存中',DELIVERY_UNKNOWN:'待核查'} as Record<string,string>)[delivery]??'待处理'}</Text>:null}</View>;
}
