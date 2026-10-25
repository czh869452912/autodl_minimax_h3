import { NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { AppDatabase } from '../storage/appDatabase';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { createAttachmentStore } from '../media/attachments';
import { NOVELAI_MAX_RESPONSE, parseNovelAiResponse } from './novelAiProtocol';
import type { NovelAiResponseStore } from './novelAiAdapter';

function native() {
  const module = NativeModules.AutoDLMedia;
  if (Platform.OS !== 'android' || !module?.generateNovelAi || !module.lookupNovelAi) throw new Error('请安装包含 NovelAI 模块的新版 Android 应用');
  return module as { generateNovelAi(key: string, request: string, hash: string, token: string): Promise<string>; lookupNovelAi(key: string, hash: string): Promise<string | null> };
}
export function novelAiResponseStore(db: AppDatabase): NovelAiResponseStore {
  return {
    assertReady(upscale) { native(); if (upscale && !NativeModules.AutoDLMedia?.upscaleNovelAi) throw new Error('请安装支持超分的新版 Android 应用'); }, generate: (...args) => native().generateNovelAi(...args), upscale: async (...args) => {
      if (!NativeModules.AutoDLMedia?.upscaleNovelAi) throw new Error('请安装支持超分的新版 Android 应用');
      return NativeModules.AutoDLMedia.upscaleNovelAi(...args);
    }, lookup: (...args) => native().lookupNovelAi(...args), async importResponse(uri, key, upscale = false) {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || info.isDirectory || info.size > NOVELAI_MAX_RESPONSE) throw new Error('NOVELAI_RESPONSE_UNAVAILABLE');
      const images = parseNovelAiResponse(await FileSystem.readAsStringAsync(uri), upscale);
      const result = [];
      for (const image of images) {
        const staged = await createAttachmentStore(db).externalize({ type: 'data', value: image.image, mimeType: 'image/png' });
        try {
          const hash = staged.hashes[0];
          if (!hash) throw new Error('NOVELAI_IMPORT_FAILED');
          await withWriteTransaction(db, tx => tx.runAsync("INSERT OR IGNORE INTO artifact_blob_refs VALUES(?,'novelai_response',?,?)", hash, key, Date.now()).then(() => undefined));
          result.push({ hash, seed: image.seed, index: image.index, width: image.width, height: image.height });
        } finally { await staged.releaseStaging(); }
      }
      return result;
    }
  };
}
