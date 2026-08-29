import { buildTaskPayload } from '../tasks/api';
import { resolveDraftPrompt } from './draftPrompt';
import { RESOLUTION_OPTIONS } from './resolutions';
import type { TaskMediaInput } from '../tasks/types';

const image: TaskMediaInput = { dataUri: 'data:image/png;base64,a', name: 'ref.png', mime: 'image/png' };

describe('create form contracts', () => {
  it('hydrates a draft only when the form still has its initial value', () => {
    expect(resolveDraftPrompt('', 'exported prompt')).toBe('exported prompt');
    expect(resolveDraftPrompt('manual edit', 'exported prompt')).toBe('manual edit');
  });
  it('serializes every API resolution without renaming it', () => {
    for (const resolution of RESOLUTION_OPTIONS) {
      expect(buildTaskPayload({ prompt: 'p', duration: 5, resolution })).toMatchObject({ resolution });
    }
  });

  it('serializes at most nine images and three audio references', () => {
    const images = Array.from({ length: 12 }, (_, index) => ({ ...image, name: `image-${index}.png` }));
    const audios = Array.from({ length: 5 }, (_, index) => ({ dataUri: `data:audio/mpeg;base64,${index}`, name: `audio-${index}.mp3`, mime: 'audio/mpeg' }));
    const payload = buildTaskPayload({ prompt: 'p', duration: 5, resolution: RESOLUTION_OPTIONS[0], images, audios });
    expect(Object.keys(payload).filter((key) => key.startsWith('ref_image_'))).toHaveLength(9);
    expect(Object.keys(payload).filter((key) => key.startsWith('ref_audio_'))).toHaveLength(3);
  });
});
