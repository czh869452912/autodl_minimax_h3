import { getDatabase } from '../storage/databaseClient';
import { assertAppDatabaseWritable } from '../storage/database';
import { readSettings } from '../settings/storage';
import type { TaskMediaInput } from '../media/types';
import { createPromptDraftStore } from '../handoff/promptDraft';
import { materializePromptHandoff } from '../handoff/promptHandoff';
import type { WorkflowDefinition } from '../workflows/schema/types';
import { createWorkflowRuntime } from '../workflows/runtime/runtime';
import { createBuiltinProviderAdapters } from '../workflows/providers/registry';
import { createAppWorkflowCatalog } from '../workflows/registry/builtin';
import type { RegistryRecord } from '../workflows/registry/types';
import { persistSubmissionCommand } from './submissionCommand';
import { notifyListeners } from '../tasks/notifyListeners';

const getPromptDraftStore = () => createPromptDraftStore(getDatabase());
let workflowCatalog: { database: ReturnType<typeof getDatabase>; catalog: ReturnType<typeof createAppWorkflowCatalog> } | undefined;
const getWorkflowCatalog = () => {
  const database = getDatabase();
  assertAppDatabaseWritable(database);
  if (!workflowCatalog || workflowCatalog.database !== database) {
    workflowCatalog = { database, catalog: createAppWorkflowCatalog() };
  }
  return workflowCatalog.catalog;
};
export type CreateFormDraftDependencies = Pick<ReturnType<typeof createPromptDraftStore>, 'read' | 'consume'> & {
  materialize: typeof materializePromptHandoff;
  discard?: (id: string) => Promise<void>;
  saveForm?: ReturnType<typeof createPromptDraftStore>['saveForm'];
};
export const defaultDraftDependencies: CreateFormDraftDependencies = {
  read: (id) => getPromptDraftStore().read(id),
  consume: (id) => getPromptDraftStore().consume(id),
  materialize: materializePromptHandoff,
  discard: id => getPromptDraftStore().discard(id),
  saveForm: (id, form) => getPromptDraftStore().saveForm(id, form),
};

type CreateFormCatalog = {
  bootstrap(): Promise<unknown>;
  listActive(): Promise<RegistryRecord[]>;
  getActive(workflowId: string): Promise<RegistryRecord | undefined>;
};
export type CreateFormSubmissionDependencies = {
  catalog: CreateFormCatalog;
  readSettings: typeof readSettings;
  queue(input: {
    definition: WorkflowDefinition;
    activeRecord: RegistryRecord;
    inputSnapshot: Record<string, unknown>;
    images: TaskMediaInput[];
    audios: TaskMediaInput[];
    token: string;
    foregroundTick: () => void | Promise<unknown>;
    handoffId?: string;
  }): Promise<{ id: string }>;
};

export const defaultSubmissionDependencies: CreateFormSubmissionDependencies = {
  catalog: {
    bootstrap: () => getWorkflowCatalog().bootstrap(),
    listActive: () => getWorkflowCatalog().listActive(),
    getActive: id => getWorkflowCatalog().getActive(id),
  },
  readSettings,
  async queue({ definition, activeRecord, inputSnapshot, images, audios, token, foregroundTick, handoffId }) {
    const database = getDatabase();
    const adapters = createBuiltinProviderAdapters({ resolveCredential: (kind) => kind === 'autodl-token' ? token : undefined });
    const runtime = createWorkflowRuntime({ adapters });
    const prepared = runtime.prepareSubmission(definition,
      { workflowId: definition.id, workflowVersion: definition.version, contentHash: activeRecord.contentHash, inputs: inputSnapshot, source: 'user', status: 'ready' },
      { workflowId: activeRecord.workflowId, workflowVersion: activeRecord.version, contentHash: activeRecord.contentHash });
    const task = await persistSubmissionCommand(database, 'submission-' + Date.now() + '-' + Math.random().toString(16).slice(2), prepared, { images, audios, handoffId });
    notifyListeners([foregroundTick]);
    return task;
  },
};
