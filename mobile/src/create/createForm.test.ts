import { buildAutodlSubmitRequest } from '../workflows/providers/autodl/mapping';
import { resolveDraftPrompt } from './draftPrompt';
import { RESOLUTION_OPTIONS } from './resolutions';
import type { TaskMediaInput } from '../tasks/types';
import { createSubmissionGate } from './submissionGate';
import { queueCreateFormSubmission } from './submissionQueue';

const image: TaskMediaInput = { dataUri: 'data:image/png;base64,a', name: 'ref.png', mime: 'image/png' };

describe('create form contracts', () => {
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
});
