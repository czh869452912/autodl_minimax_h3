import {confirmOutboundScopes} from './outboundConsentUI';
import {creativeRequestHash} from './videoSubmission';
import {preparedCreativeSubmission,creativeSubmissionBinding} from './preparedSubmission';
import {createApplicationProviderRegistry} from '../providers/applicationRegistry';
import { creativeVideoWorkflowId } from './videoWorkflow';
import { getDatabase } from '../storage/databaseClient';
import { readCreativeDraft, readDraftInputs, editableVideoInput } from './drafts';
import { creativeFiles } from './runtime';
import { createAppWorkflowCatalog } from '../workflows/registry/builtin';
import { registryRecordToDefinition } from '../workflows/registry/catalog';
import { alignWorkflowInputs } from '../workflows/inputModel';
import { buildSubmissionInputSnapshot } from '../create/submissionInput';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { creativeAccounts, creativeBudget } from './accountRuntime';
import { submitCreativeVideo } from './videoSubmission';
import {videoWorkflowReason} from './videoDraftState';
import {formatSubmissionFieldError,validateSubmissionBeforeQueue} from '../create/submissionValidation';

export async function prepareCreativeVideo(id: string) {
  const db = getDatabase(), draft = await readCreativeDraft(db, id);
  if (!draft || draft.state !== 'EDITING') throw new Error('草稿已提交或不可编辑');
  const input = editableVideoInput.parse(JSON.parse(draft.input_json));
  const references = await readDraftInputs(db, id);
  for (const ref of references) await creativeFiles().verify(ref.version_id);
  const refs = await readDraftInputs(db, id);
  if (refs.some(r => r.state !== 'AVAILABLE')) throw new Error('请先恢复参考素材原件');
  const media=(slot:string)=>refs.filter(r=>slot==='audio'?r.slot==='audio':r.slot!=='audio').map(r=>({uri:`asset://${r.blob_sha256}`,sha256:r.blob_sha256,mime:r.mime,size:r.byte_size,name:r.version_id}));
  const images=media('image'),audios=media('audio');
  if([...images,...audios].reduce((sum,item)=>sum+item.size,0)>50*1024*1024)throw new Error('参考素材总计不能超过 50MB');
  const catalog = createAppWorkflowCatalog(); await catalog.bootstrap();
  const record = await catalog.getActive(creativeVideoWorkflowId(draft.workflow_id));
  if (!record) throw new Error('草稿工作流不可用，请在工作流管理中恢复');
  const definition = registryRecordToDefinition(record);
  const reason=videoWorkflowReason(definition);if(reason)throw new Error(reason);
  if(input.schemaVersion===2 && (input.workflow.id!==record.workflowId || input.workflow.version!==record.version || input.workflow.contentHash!==record.contentHash))throw new Error('工作流版本已变化，请先对齐当前版本后再生成');
  const { schemaVersion: _, ...fields } = input;
  const values=input.schemaVersion===2?input.values:alignWorkflowInputs(definition,fields).values;
  const snapshot = buildSubmissionInputSnapshot({ definition, workflowValues:values, fallback: {prompt:input.prompt,resolution:'',duration:'',seed:''}, images, audios });
  const checked=validateSubmissionBeforeQueue({definition,loaded:record,active:record,inputs:snapshot});
  if(!checked.ok)throw new Error(checked.fieldErrors.map(error=>formatSubmissionFieldError(error,definition)).join('\n'));
  const providers=createApplicationProviderRegistry(db);
  const runtime = createWorkflowRuntime({ adapters: providers.workflowAdapters() });
  const provenance = { workflowId: record.workflowId, workflowVersion: record.version, contentHash: record.contentHash };
  const prepared = runtime.prepareSubmission(definition, { ...provenance, inputs: snapshot, source: 'user', status: 'ready' }, provenance);
  const account = (await creativeAccounts(db).list()).find(a => a.provider_id === 'autodl');
  if (!account) throw new Error('请先绑定 AutoDL 创作凭据');
  const identity=await creativeAccounts(db).resolveExact(account.credential_generation_id);
  await providers.adapter(prepared.adapterId,identity,'preflight').prepareInput?.(prepared.requestInput,prepared.target);
  return { db, draft, images,audios, versionIds: refs.map(r => r.version_id), prepared, account };
}

export async function confirmCreativeVideo(preview: Awaited<ReturnType<typeof prepareCreativeVideo>>) {
  if (preview.db !== getDatabase()) throw new Error('数据库已恢复或切换，请重新打开草稿');
  const active=await createAppWorkflowCatalog().getActive(preview.prepared.workflowId);
  if(!active||active.version!==preview.prepared.workflowVersion||active.contentHash!==preview.prepared.workflowContentHash)throw new Error('工作流版本已变化，请核对后再生成');
  await creativeAccounts(preview.db).resolveExact(preview.account.credential_generation_id);
  await confirmOutboundScopes(preview.db,[{projectId:preview.draft.project_id,provider:'autodl',generationId:preview.account.credential_generation_id,requestHash:creativeRequestHash(preview.prepared),versions:preview.versionIds}]);
  const authorizationId = await creativeBudget().grant({ provider: 'autodl', generationId: preview.account.credential_generation_id,
    projectId: preview.draft.project_id ?? undefined, operations: ['video.generate'], requestLimit: 1,
    amountLimit: null, allowUnknownCost: true, maxUnknownRequests: 1, requestBinding:creativeSubmissionBinding(preview), expiresAt: Date.now() + 15 * 60_000 });
  return submitCreativeVideo(preview.db, { ...preparedCreativeSubmission(preview), authorizationId });
}
