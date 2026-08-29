import { exportVideo } from './media';

describe('native gallery publisher', () => {
  it('passes a stable media id and file name to Android', async () => {
    const native = {
      exportVideo: jest.fn().mockResolvedValue({
        uri: 'content://media/video/7',
        displayName: 'task-1.mp4',
        relativePath: 'Movies/AutoDL-H3/',
        alreadyExisted: false,
      }),
    };
    await expect(exportVideo('file:///private.mp4', {
      mediaId: 'task-1',
      displayName: 'task-1.mp4',
    }, native as never)).resolves.toMatchObject({ uri: 'content://media/video/7' });
    expect(native.exportVideo).toHaveBeenCalledWith('file:///private.mp4', 'task-1', 'task-1.mp4');
  });

  it('rejects a blank source before invoking Android', async () => {
    await expect(exportVideo(' ', { mediaId: 'task-1' }, {} as never)).rejects.toThrow('视频源为空');
  });
});
