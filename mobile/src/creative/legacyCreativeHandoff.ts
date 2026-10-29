import CryptoJS from 'crypto-js';
import { createPromptDraftStore } from '../handoff/promptDraft';
import { materializePromptHandoff, resolvePromptHandoffValues } from '../handoff/promptHandoff';
import { getDatabase } from '../storage/databaseClient';
import { createAttachmentStore } from '../media/attachments';
import type { TaskMediaInput } from '../media/types';
import { canonicalInputs } from '../workflows/inputModel';
import { alignVideoState } from './videoDraftState';
import { listVideoWorkflows } from './videoWorkbenchWorkflows';
import { H3_CREATIVE_WORKFLOW_ID } from './videoWorkflow';
import { creativeService } from './runtime';
import { stageCreativeFile } from './fileImport';

/** Receipts are the durable legacy→creative mapping; never consume or erase the source. */
export async function importLegacyCreativeDraft(legacyId: string) {
  const db = getDatabase(), service = creativeService();
  const key = `handoff.creative.${CryptoJS.SHA256(legacyId)}`;
  const receipt = await db.getFirstAsync<{result_json:string}>('SELECT result_json FROM creative_command_receipts WHERE idempotency_key=?',key);
  if (receipt) {
    const row = await service.draft(JSON.parse(receipt.result_json).value.draftId);
    if (!row || row.state === 'DISCARDED') throw new Error('已转换的创作已移除，请重新导出一份交接草稿');
    return row;
  }
  const source = await createPromptDraftStore(db).read(legacyId);
  if (!source) throw new Error('交接草稿已过期或不存在，请返回助手重新导出');
  if (!source.form && !source.handoff && source.attachmentIds.length) throw new Error('旧草稿缺少参考素材数据，请重新添加并导出');
  const workflowId = source.form?.workflowId ?? source.handoff?.target?.workflowId ?? H3_CREATIVE_WORKFLOW_ID;
  const entry = (await listVideoWorkflows()).find(item=>item.record.workflowId===workflowId);
  if (!entry || entry.reason) throw new Error(entry?.reason || '原工作流不可用，请在设置恢复后重试；原草稿已保留');
  if (source.form?.contentHash && source.form.contentHash !== entry.record.contentHash) throw new Error('原工作流已变更，请核对参数后重新导出，原草稿已保留');
  const values = source.form?.canonicalValues ?? (source.form ? canonicalInputs(entry.definition,source.form.values) : source.handoff ? canonicalInputs(entry.definition,resolvePromptHandoffValues(source.handoff,entry.definition)) : {prompt:source.prompt});
  const aligned = alignVideoState(entry.record,entry.definition,key,values);
  // Do not silently discard incompatible fields during conversion.
  if (aligned.notices.length) throw new Error(`交接参数需要核对：${aligned.notices.join('；')}。请在助手重新导出，原草稿已保留`);
  const images = source.form?.images ?? (source.handoff ? await materializePromptHandoff(source.handoff) : []);
  const audios = source.form?.audios ?? [];
  const importMedia = async (media:TaskMediaInput,kind:'image'|'audio',index:number) => {
    const mediaKey = `${key}.${kind}.${index}.${CryptoJS.SHA256(JSON.stringify(media))}`;
    const old = await db.getFirstAsync<{result_json:string}>('SELECT result_json FROM creative_command_receipts WHERE idempotency_key=?',mediaKey);
    if (old) return JSON.parse(old.result_json).value.versionId as string;
    const staged = await createAttachmentStore(db,kind==='audio'?{importImage:stageCreativeFile}:undefined).externalize({uri:media.uri??media.dataUri,mimeType:media.mime,name:media.name});
    try {
      if (!staged.hashes[0]) throw new Error('参考素材无法读取，原草稿已保留');
      const result = await service.execute({name:'asset.import',payload:{kind,title:media.name||`${kind} ${index+1}`,blobSha256:staged.hashes[0]}},mediaKey);
      if(result.status!=='completed')throw new Error('参考素材未完成导入');
      return result.value.versionId;
    } finally { await staged.releaseStaging(); }
  };
  const imageVersionIds:string[]=[],audioVersionIds:string[]=[];
  for(const [i,media] of images.entries())imageVersionIds.push(await importMedia(media,'image',i));
  for(const [i,media] of audios.entries())audioVersionIds.push(await importMedia(media,'audio',i));
  const result=await service.execute({name:'draft.createVideo',payload:{input:aligned.input,imageVersionIds,audioVersionIds}},key);
  if(result.status!=='completed')throw new Error('交接未完成，请重试');
  const row=await service.draft(result.value.draftId);
  if(!row)throw new Error('创作读取失败，请重试');
  return row;
}
