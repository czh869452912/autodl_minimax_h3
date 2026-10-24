import { NativeModules } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { creativeFiles, creativeService } from './runtime';
import { novelAiDraftInput } from './novelAiProtocol';
import { createEnhanceInput } from './novelAiEnhancement';
import { createId } from '../ids';
import type { AssetVersion } from './types';

export async function createImageProcessingDraft(version:AssetVersion, operation:'enhance'|'upscale', context:{projectId?:string;shotId?:string}) {
  if (version.state!=='AVAILABLE' || !version.relativePath || (await creativeFiles().verify(version.id))?.state!=='AVAILABLE') throw new Error('原图缺失或校验失败，请先恢复原件');
  if (operation==='upscale') return creativeService().execute({name:'draft.createUpscale',payload:{versionId:version.id,projectId:context.projectId}},createId());
  const recipe=novelAiDraftInput.safeParse(version.recipe.input);
  if (!recipe.success) throw new Error('这张图片没有完整生成参数，可使用清晰放大');
  if (!NativeModules.AutoDLMedia?.readCreativeImageInfo) throw new Error('请安装支持增强的新版 Android 应用');
  const info=await NativeModules.AutoDLMedia.readCreativeImageInfo(`${FileSystem.documentDirectory}${version.relativePath}`);
  return creativeService().execute({name:'draft.createImage',payload:{fromVersionId:version.id,...context,input:createEnhanceInput(recipe.data,version.id,info.width,info.height)}},createId());
}
