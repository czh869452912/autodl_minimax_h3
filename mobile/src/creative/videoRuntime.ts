import { getDatabase } from '../storage/databaseClient';
import { readCreativeDraft, readDraftInputs, videoDraftInput } from './drafts';
import { creativeFiles } from './runtime';
import { createAppWorkflowCatalog } from '../workflows/registry/builtin';
import { registryRecordToDefinition } from '../workflows/registry/catalog';
import { alignWorkflowInputs } from '../workflows/inputModel';
import { buildSubmissionInputSnapshot } from '../create/submissionInput';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';
import { creativeAccounts, creativeBudget } from './accountRuntime';
import { submitCreativeVideo } from './videoSubmission';

export async function prepareCreativeVideo(id: string) {
  const db = getDatabase(), draft = await readCreativeDraft(db, id);
  if (!draft || draft.state !== 'EDITING') throw new Error('草稿已提交或不可编辑');
  const input = videoDraftInput.parse(JSON.parse(draft.input_json));
  const references = await readDraftInputs(db, id);
  for (const ref of references) await creativeFiles().verify(ref.version_id);
  const refs = await readDraftInputs(db, id);
  if (refs.some(r => r.state !== 'AVAILABLE')) throw new Error('请先恢复参考图原件');
  const images = refs.map(r => ({ uri: `asset://${r.blob_sha256}`, sha256: r.blob_sha256, mime: r.mime, size: r.byte_size, name: r.version_id }));
  const catalog = createAppWorkflowCatalog(); await catalog.bootstrap();
  const record = await catalog.getActive(draft.workflow_id);
  if (!record) throw new Error('H3 工作流尚未安装');
  const definition = registryRecordToDefinition(record);
  const { schemaVersion: _, ...fields } = input;
  const aligned = alignWorkflowInputs(definition, fields);
  const snapshot = buildSubmissionInputSnapshot({ definition, workflowValues: aligned.values, fallback: { ...input, duration: String(input.duration) }, images, audios: [] });
  const runtime = createWorkflowRuntime({ adapters: createBuiltinProviderAdapters({ resolveCredential: () => undefined }) });
  const provenance = { workflowId: record.workflowId, workflowVersion: record.version, contentHash: record.contentHash };
  const prepared = runtime.prepareSubmission(definition, { ...provenance, inputs: snapshot, source: 'user', status: 'ready' }, provenance);
  const account = (await creativeAccounts(db).list()).find(a => a.provider_id === 'autodl');
  if (!account) throw new Error('请先绑定 AutoDL 创作凭据');
  return { db, draft, images, versionIds: refs.map(r => r.version_id), prepared, account };
}

export async function confirmCreativeVideo(preview: Awaited<ReturnType<typeof prepareCreativeVideo>>) {
  if (preview.db !== getDatabase()) throw new Error('数据库已恢复或切换，请重新打开草稿');
  const authorizationId = await creativeBudget().grant({ provider: 'autodl', generationId: preview.account.credential_generation_id,
    projectId: preview.draft.project_id ?? undefined, operations: ['video.generate'], requestLimit: 1,
    amountLimit: null, allowUnknownCost: true, maxUnknownRequests: 1, expiresAt: Date.now() + 15 * 60_000 });
  return submitCreativeVideo(preview.db, { draftId: preview.draft.id, expectedRevision: preview.draft.revision, draftInputJson: preview.draft.input_json,
    authorizationId, prepared: preview.prepared, images: preview.images, versionIds: preview.versionIds });
}
