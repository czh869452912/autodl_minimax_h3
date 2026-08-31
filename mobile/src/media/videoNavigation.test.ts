import { mediaSource } from '../gallery/presentation';
import type { TaskRecord } from '../tasks/types';

describe('video navigation contract', () => {
  it('uses a local downloaded video before the remote URL', () => {
    const task: Pick<TaskRecord, 'localUri' | 'videoUrl'> = { localUri: 'file:///local.mp4', videoUrl: 'https://example/video.mp4' };
    expect(mediaSource(task)).toBe('file:///local.mp4');
  });
  it('does not use the published system-gallery item as the app media source', () => {
    expect(mediaSource({
      galleryUri: 'content://media/video/7',
      videoUrl: 'https://example/video.mp4',
    } as never)).toBe('https://example/video.mp4');
  });
  it('returns an empty source for a task without media', () => {
    expect(mediaSource({})).toBe('');
  });
});
