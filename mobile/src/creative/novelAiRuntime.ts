import { NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import CryptoJS from 'crypto-js';
import type { AppDatabase } from '../storage/appDatabase';
import { getDatabase } from '../storage/databaseClient';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { createAttachmentStore } from '../media/attachments';
import { novelAiDraftInput, parseNovelAiResponse, prepareNovelAiRequest } from './novelAiProtocol';
import { readCreativeDraft, readDraftInputs } from './drafts';
import { creativeAccounts, creativeBudget } from './accountRuntime';
import { submitCreativeVideo } from './videoSubmission';
import type { NovelAiResponseStore } from './novelAiAdapter';

function native() {
  const module = NativeModules.AutoDLMedia;
  if (Platform.OS !== 'android' || !module?.generateNovelAi || !module.lookupNovelAi) throw new Error('请安装包含 NovelAI 模块的新版 Android 应用');
  return module as { generateNovelAi(key: string, request: string, hash: string, token: string): Promise<string>; lookupNovelAi(key: string, hash: string): Promise<string | null> };
}
export function novelAiResponseStore(db: AppDatabase): NovelAiResponseStore {
  return { generate: (...args) => native().generateNovelAi(...args), lookup: (...args) => native().lookupNovelAi(...args), async importResponse(uri, key) {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || info.size > 20 * 1024 * 1024) throw new Error('NOVELAI_RESPONSE_UNAVAILABLE');
    const images = parseNovelAiResponse(await FileSystem.readAsStringAsync(uri));
    const result = [];
    for (const image of images) {
      const staged = await createAttachmentStore(db).externalize({ dataUri: `data:image/png;base64,${image.image}` });
      try {
        const hash = staged.hashes[0];
        if (!hash) throw new Error('NOVELAI_IMPORT_FAILED');
        await withWriteTransaction(db, tx => tx.runAsync("INSERT OR IGNORE INTO artifact_blob_refs VALUES(?,'novelai_response',?,?)", hash, key, Date.now()).then(() => undefined));
        result.push({ hash, seed: image.seed, index: image.index });
      } finally { await staged.releaseStaging(); }
    }
    return result;
  } };
}
export async function prepareCreativeImage(id: string) {
  const db = getDatabase(), draft = await readCreativeDraft(db, id);
  if (!draft || draft.provider_id !== 'novelai' || draft.state !== 'EDITING') throw new Error('图片草稿不可编辑');
  const request = prepareNovelAiRequest(novelAiDraftInput.parse(JSON.parse(draft.input_json)));
  const account = (await creativeAccounts(db).list()).find(a => a.provider_id === 'novelai');
  if (!account) throw new Error('请先连接 NovelAI 创作账号');
  const prepared = { workflowId: 'novelai-image-basic', workflowVersion: '1', workflowContentHash: CryptoJS.SHA256(request.capabilitiesVersion).toString(), adapterId: 'novelai-image', adapterVersion: '1', inputSnapshot: request.snapshot, requestInput: JSON.parse(request.requestJson), target: { operation: 'image.generate' } };
  return { db, draft, account, prepared, versionIds: (await readDraftInputs(db, id)).map(r => r.version_id) };
}
export async function confirmCreativeImage(preview: Awaited<ReturnType<typeof prepareCreativeImage>>) {
  if (preview.db !== getDatabase()) throw new Error('数据库已恢复或切换，请重新准备生成');
  const authorizationId = await creativeBudget().grant({ provider: 'novelai', generationId: preview.account.credential_generation_id, projectId: preview.draft.project_id ?? undefined,
    operations: ['image.generate'], requestLimit: 1, amountLimit: null, allowUnknownCost: true, maxUnknownRequests: 1, expiresAt: Date.now() + 15 * 60_000 });
  return submitCreativeVideo(preview.db, { draftId: preview.draft.id, expectedRevision: preview.draft.revision, draftInputJson: preview.draft.input_json, authorizationId, prepared: preview.prepared, images: [], versionIds: preview.versionIds });
}
