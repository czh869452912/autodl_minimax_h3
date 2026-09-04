import { buildAutodlSubmitRequest } from '../workflows/providers/autodl/mapping';
import { resolveDraftPrompt } from './draftPrompt';
import { RESOLUTION_OPTIONS } from './resolutions';
import type { TaskMediaInput } from '../tasks/types';
import { createSubmissionGate } from './submissionGate';
import { queueCreateFormSubmission } from './submissionQueue';
import { act, create } from 'react-test-renderer';
import { Alert, Pressable, Text, TextInput } from 'react-native';
import { CreateForm } from './CreateForm';
import { builtinWorkflowDefinitions } from '../workflows/registry/builtin';
import type { RegistryRecord } from '../workflows/registry/types';
import { createElement } from 'react';
import { canonicalizeDefinition } from '../workflows/registry/canonicalize';
import { LEGACY_DEFINITION_IDENTITY_V1 } from '../workflows/registry/identity';
import { RegistryReleaseError } from '../workflows/registry/releaseManifest';

jest.mock('../storage/databaseClient', () => ({ getDatabase: () => undefined }));
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn() }) }));
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({}), useAudioPlayerStatus: () => ({}) }));

const image: TaskMediaInput = { dataUri: 'data:image/png;base64,a', name: 'ref.png', mime: 'image/png' };

function historicalActiveRecord(): RegistryRecord {
  const definition = builtinWorkflowDefinitions[0];
  return {
    workflowId: definition.id,
    version: definition.version,
    contentHash: '917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390',
    hashScheme: LEGACY_DEFINITION_IDENTITY_V1,
    source: 'builtin',
    trust: 'builtin',
    definitionJson: canonicalizeDefinition(definition),
    installedAt: 1,
  };
}

async function renderCreateForm(catalog: {
  bootstrap(): Promise<unknown>;
  listActive(): Promise<RegistryRecord[]>;
  getActive(workflowId: string): Promise<RegistryRecord | undefined>;
}) {
  const readSettings = jest.fn(async () => ({
    token: '', llmEndpoint: '', llmModel: '', llmApiKey: '', llmTimeoutSeconds: '600',
    llmMaxRetries: '2', autoExportToGallery: true, keepPrivateCopy: true,
  }));
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(createElement(CreateForm, {
      submissionDependencies: { catalog: catalog as never, readSettings, queue: jest.fn() },
    }));
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

function renderedText(tree: ReturnType<typeof create>): string {
  return tree.root.findAllByType(Text).map((node) => node.props.children).flat(Infinity).join(' ');
}

function activeRecordTitle(record: RegistryRecord): string {
  return JSON.parse(record.definitionJson).metadata.title;
}

describe('create form contracts', () => {
  beforeEach(() => { jest.restoreAllMocks(); });
  it('uses an exported draft to replace an existing prompt', () => {
    expect(resolveDraftPrompt('', 'exported prompt')).toBe('exported prompt');
    expect(resolveDraftPrompt('manual edit', 'exported prompt')).toBe('exported prompt');
    expect(resolveDraftPrompt('manual edit', '   ')).toBe('manual edit');
  });
  it('serializes every API resolution without renaming it', () => {
    for (const resolution of RESOLUTION_OPTIONS) {
      expect(buildAutodlSubmitRequest({ prompt: 'p', duration: 5, resolution })).toMatchObject({ resolution });
    }
  });

  it('serializes at most nine images and three audio references', () => {
    const images = Array.from({ length: 12 }, (_, index) => ({ ...image, name: `image-${index}.png` }));
    const audios = Array.from({ length: 5 }, (_, index) => ({ dataUri: `data:audio/mpeg;base64,${index}`, name: `audio-${index}.mp3`, mime: 'audio/mpeg' }));
    const payload = buildAutodlSubmitRequest({ prompt: 'p', duration: 5, resolution: RESOLUTION_OPTIONS[0], images, audios });
    expect(Object.keys(payload).filter((key) => key.startsWith('ref_image_'))).toHaveLength(9);
    expect(Object.keys(payload).filter((key) => key.startsWith('ref_audio_'))).toHaveLength(3);
  });

  it('allows only one in-flight generation submission', async () => {
    const gate = createSubmissionGate();
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });

  it('queues locally, persists the task projection, and triggers a foreground tick', async () => {
    const queued = {
      id: 'job-1', revision: 0, workflowId: 'demo', workflowVersion: '1', workflowContentHash: 'hash',
      adapterId: 'demo', adapterVersion: '1', inputSnapshot: { prompt: 'hello', resolution: '768p竖', duration: 5 },
      status: 'READY_TO_SUBMIT' as const, createdAt: 1, updatedAt: 1,
    };
    const queueSubmission = jest.fn(async () => queued);
    const upsertTask = jest.fn(async () => undefined);
    const foregroundTick = jest.fn(async () => undefined);
    const directSubmit = jest.fn();
    const task = await queueCreateFormSubmission(
      { queueSubmission, upsertTask, foregroundTick },
      { submissionId: 'submission-1', workflow: {} as never, draft: {} as never, provenance: {} as never },
      { images: [image], audios: [] },
    );
    expect(queueSubmission).toHaveBeenCalledTimes(1);
    expect(upsertTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1', status: 'QUEUED', images: [image] }));
    expect(foregroundTick).toHaveBeenCalledTimes(1);
    expect(directSubmit).not.toHaveBeenCalled();
    expect(task.id).toBe('job-1');
  });

  it.each([
    ['rejects 10,001 prompt characters before credentials or queue access', 10_001, 0],
    ['accepts exactly 10,000 prompt characters and queues once', 10_000, 1],
  ])('%s', async (_name, promptLength, expectedQueues) => {
    const definition = builtinWorkflowDefinitions[1];
    const active: RegistryRecord = {
      workflowId: definition.id,
      version: definition.version,
      contentHash: 'active-hash',
      hashScheme: 'workflow-package/without-declared-hash+sorted-json@1',
      source: 'builtin',
      trust: 'builtin',
      definitionJson: JSON.stringify(definition),
      installedAt: 1,
    };
    const readSettings = jest.fn(async () => ({
      token: 'token', llmEndpoint: 'https://api.example.test/v1', llmModel: 'model', llmApiKey: '',
      llmTimeoutSeconds: '600', llmMaxRetries: '2', autoExportToGallery: true, keepPrivateCopy: true,
    }));
    const queue = jest.fn(async () => ({ id: 'task-1' }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const catalog = {
      bootstrap: jest.fn(async () => undefined),
      listActive: jest.fn(async () => [active]),
      getActive: jest.fn(async () => active),
    };
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(createElement(CreateForm, { submissionDependencies: { catalog, readSettings, queue } }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const promptInput = tree.root.findAllByType(TextInput).find((node) => node.props.multiline);
    expect(promptInput).toBeDefined();
    act(() => { promptInput?.props.onChangeText('a'.repeat(promptLength)); });
    const submitButton = tree.root.findAll((node) => node.props.accessibilityLabel === '提交 AutoDL 任务生成')[0];
    expect(submitButton).toBeDefined();
    await act(async () => {
      submitButton!.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(queue).toHaveBeenCalledTimes(expectedQueues);
    expect(readSettings).toHaveBeenCalledTimes(expectedQueues);
    if (expectedQueues === 0) {
      expect(alert).toHaveBeenCalledWith('参数设置不合法', expect.stringContaining('最多 10,000 个字符'));
    }
  });

  it('shows a localized upgrade diagnostic instead of a raw immutability exception', async () => {
    const active = historicalActiveRecord();
    const tree = await renderCreateForm({
      bootstrap: jest.fn(async () => { throw new RegistryReleaseError('REGISTRY_IMMUTABLE_VERSION_CONFLICT'); }),
      listActive: jest.fn(async () => [active]),
      getActive: jest.fn(async () => active),
    });

    expect(renderedText(tree)).toContain('工作流升级校验失败');
    expect(renderedText(tree)).not.toContain('REGISTRY_IMMUTABLE_VERSION_CONFLICT');
    expect(renderedText(tree)).not.toContain('workflow definition is immutable');
  });

  it('keeps a valid active workflow usable after a safely rolled-back release update', async () => {
    const active = historicalActiveRecord();
    const tree = await renderCreateForm({
      bootstrap: jest.fn(async () => { throw new RegistryReleaseError('REGISTRY_RELEASE_TRANSACTION_ROLLED_BACK'); }),
      listActive: jest.fn(async () => [active]),
      getActive: jest.fn(async () => active),
    });

    expect(renderedText(tree)).toContain(activeRecordTitle(active));
    expect(renderedText(tree)).toContain('工作流升级失败，已保留当前版本');
    expect(tree.root.findByProps({ accessibilityLabel: '提交 AutoDL 任务生成' }).props.disabled).toBe(false);
  });

  it('disables submission when stored workflow content fails integrity validation', async () => {
    const listActive = jest.fn(async () => [historicalActiveRecord()]);
    const tree = await renderCreateForm({
      bootstrap: jest.fn(async () => { throw new RegistryReleaseError('REGISTRY_STORED_DIGEST_INVALID'); }),
      listActive,
      getActive: jest.fn(async () => undefined),
    });

    expect(renderedText(tree)).toContain('工作流数据完整性校验失败');
    expect(listActive).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ accessibilityLabel: '提交 AutoDL 任务生成' }).props.disabled).toBe(true);
  });

  it('preserves an integrity diagnostic when safe fallback discovery finds a bad pointer', async () => {
    const tree = await renderCreateForm({
      bootstrap: jest.fn(async () => { throw new RegistryReleaseError('REGISTRY_RELEASE_BACKUP_FAILED'); }),
      listActive: jest.fn(async () => { throw new RegistryReleaseError('REGISTRY_ACTIVE_POINTER_INVALID'); }),
      getActive: jest.fn(async () => undefined),
    });

    expect(renderedText(tree)).toContain('工作流数据完整性校验失败');
    expect(tree.root.findByProps({ accessibilityLabel: '提交 AutoDL 任务生成' }).props.disabled).toBe(true);
  });
});
