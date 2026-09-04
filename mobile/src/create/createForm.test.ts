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

jest.mock('../storage/databaseClient', () => ({ getDatabase: () => undefined }));
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn() }) }));
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({}), useAudioPlayerStatus: () => ({}) }));

const image: TaskMediaInput = { dataUri: 'data:image/png;base64,a', name: 'ref.png', mime: 'image/png' };

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
});
