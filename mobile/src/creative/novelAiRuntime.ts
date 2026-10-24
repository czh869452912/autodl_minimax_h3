import { NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import CryptoJS from 'crypto-js';
import type { AppDatabase } from '../storage/appDatabase';
import { getDatabase } from '../storage/databaseClient';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { createAttachmentStore } from '../media/attachments';
import { novelAiDraftInput, novelAiSourceIds, NOVELAI_MAX_RESPONSE, parseNovelAiResponse, prepareNovelAiRequest } from './novelAiProtocol';
import { creativeFiles } from './runtime';
import { readCreativeDraft, readDraftInputs } from './drafts';
import { creativeAccounts, creativeBudget } from './accountRuntime';
import { submitCreativeVideo } from './videoSubmission';
import type { NovelAiResponseStore } from './novelAiAdapter';
import {novelAiUpscaleInput,prepareNovelAiUpscale} from './novelAiUpscale';

function native() {
  const module = NativeModules.AutoDLMedia;
  if (Platform.OS !== 'android' || !module?.generateNovelAi || !module.lookupNovelAi) throw new Error('请安装包含 NovelAI 模块的新版 Android 应用');
  return module as { generateNovelAi(key: string, request: string, hash: string, token: string): Promise<string>; lookupNovelAi(key: string, hash: string): Promise<string | null> };
}
export function novelAiResponseStore(db: AppDatabase): NovelAiResponseStore {
  return { generate: (...args) => native().generateNovelAi(...args), upscale:async(...args)=>{
    if(!NativeModules.AutoDLMedia?.upscaleNovelAi)throw new Error('请安装支持超分的新版 Android 应用');
    return NativeModules.AutoDLMedia.upscaleNovelAi(...args);
  }, lookup: (...args) => native().lookupNovelAi(...args), async importResponse(uri, key, upscale=false) {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || info.size > NOVELAI_MAX_RESPONSE) throw new Error('NOVELAI_RESPONSE_UNAVAILABLE');
    const images = parseNovelAiResponse(await FileSystem.readAsStringAsync(uri),upscale);
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
  } };
}
export async function prepareCreativeImage(id: string) {
  const db = getDatabase(), draft = await readCreativeDraft(db, id);
  if (!draft || draft.provider_id !== 'novelai' || draft.state !== 'EDITING') throw new Error('图片草稿不可编辑');
  const savedInput=JSON.parse(draft.input_json);
  if(savedInput.operation==='upscale')return prepareCreativeUpscale(db,draft,novelAiUpscaleInput.parse(savedInput));
  const input = novelAiDraftInput.parse(savedInput);
  const refs = await readDraftInputs(db, id);
  const source = async (versionId: string | null, mask = false) => {
    const ref = refs.find(r => r.version_id === versionId);
    if (!ref || ref.state !== 'AVAILABLE' || !ref.mime?.startsWith('image/')) throw new Error('底图或蒙版原件待恢复');
    if((await creativeFiles().verify(ref.version_id))?.state!=='AVAILABLE')throw new Error('底图或蒙版原件缺失或校验失败，请先恢复原件');
    if (input.enhancement && !mask) {
      if (!NativeModules.AutoDLMedia?.prepareNovelAiUpscale) throw new Error('请安装支持增强的新版 Android 应用');
      // Enhance sends the original pixels; resizing first changes the diffusion input.
      const media = await NativeModules.AutoDLMedia.prepareNovelAiUpscale(`${FileSystem.documentDirectory}${ref.relative_path}`);
      if (media.width !== input.enhancement.sourceWidth || media.height !== input.enhancement.sourceHeight) throw new Error('底图尺寸已改变，请从原图重新打开 Enhance');
      return media.image as string;
    }
    if (!NativeModules.AutoDLMedia?.prepareNovelAiImage) throw new Error('请安装支持图生图的新版 Android 应用');
    return NativeModules.AutoDLMedia.prepareNovelAiImage(`${FileSystem.documentDirectory}${ref.relative_path}`, input.width, input.height, mask, '[]') as Promise<string>;
  };
  let media: { image: string; mask?: string } | undefined;
  if (input.action !== 'generate') {
    if (novelAiSourceIds(input).some(id => !refs.some(r => r.version_id === id))) throw new Error('底图或蒙版关联已改变，请重新选择');
    media = { image: await source(input.sourceVersionId) };
    if (input.action === 'infill') media.mask = input.maskVersionId ? await source(input.maskVersionId, true) : await NativeModules.AutoDLMedia.prepareNovelAiImage('', input.width, input.height, true, JSON.stringify(input.maskStrokes));
  }
  const request = prepareNovelAiRequest(input, Math.random, media);
  const account = (await creativeAccounts(db).list()).find(a => a.provider_id === 'novelai');
  if (!account) throw new Error('请先连接 NovelAI 创作账号');
  const prepared = { workflowId: 'novelai-image-basic', workflowVersion: '1', workflowContentHash: CryptoJS.SHA256(request.capabilitiesVersion).toString(), adapterId: 'novelai-image', adapterVersion: '1', inputSnapshot: request.snapshot, requestInput: JSON.parse(request.requestJson), target: { operation: 'image.generate' } };
  return { db, draft, account, prepared, versionIds: refs.map(r => r.version_id), sourceManifest: refs.map(r => ({ versionId: r.version_id, sha256: r.blob_sha256, state: r.state })) };
}
async function prepareCreativeUpscale(db:AppDatabase,draft:NonNullable<Awaited<ReturnType<typeof readCreativeDraft>>>,input:{sourceVersionId:string;operation:'upscale';schemaVersion:1}){
  const refs=await readDraftInputs(db,draft.id),ref=refs[0];
  if(refs.length!==1 || ref.version_id!==input.sourceVersionId || ref.state!=='AVAILABLE' || !ref.mime?.startsWith('image/'))throw new Error('超分原图不可用，请先恢复原件');
  if((await creativeFiles().verify(ref.version_id))?.state!=='AVAILABLE')throw new Error('超分原图缺失或校验失败，请先恢复原件');
  if(!NativeModules.AutoDLMedia?.prepareNovelAiUpscale)throw new Error('请安装支持超分的新版 Android 应用');
  const media=await NativeModules.AutoDLMedia.prepareNovelAiUpscale(`${FileSystem.documentDirectory}${ref.relative_path}`);
  const request=prepareNovelAiUpscale(input,media);
  const account=(await creativeAccounts(db).list()).find(a=>a.provider_id==='novelai');
  if(!account)throw new Error('请先连接 NovelAI 创作账号');
  const prepared={workflowId:draft.workflow_id,workflowVersion:'1',workflowContentHash:CryptoJS.SHA256('novelai-standalone-upscale-2026-10-24').toString(),adapterId:'novelai-image',adapterVersion:'1',inputSnapshot:request.snapshot,requestInput:request.requestInput,target:{operation:'image.generate'}};
  return {db,draft,account,prepared,versionIds:refs.map(r=>r.version_id),sourceManifest:refs.map(r=>({versionId:r.version_id,sha256:r.blob_sha256,state:r.state}))};
}
export async function confirmCreativeImage(preview: Awaited<ReturnType<typeof prepareCreativeImage>>) {
  if (preview.db !== getDatabase()) throw new Error('数据库已恢复或切换，请重新准备生成');
  const authorizationId = await creativeBudget().grant({ provider: 'novelai', generationId: preview.account.credential_generation_id, projectId: preview.draft.project_id ?? undefined,
    operations: ['image.generate'], requestLimit: 1, amountLimit: null, allowUnknownCost: true, maxUnknownRequests: 1, expiresAt: Date.now() + 15 * 60_000 });
  return submitCreativeVideo(preview.db, { draftId: preview.draft.id, expectedRevision: preview.draft.revision, draftInputJson: preview.draft.input_json, authorizationId, prepared: preview.prepared, images: [], versionIds: preview.versionIds, sourceManifest: preview.sourceManifest });
}
