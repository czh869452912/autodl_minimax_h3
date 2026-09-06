import { File, Paths } from 'expo-file-system';
import { materializePromptHandoff, resolvePromptHandoffValues, type PromptHandoff } from './promptHandoff';
import { builtinWorkflowDefinitions } from '../workflows/registry/builtin';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4XcAAAAASUVORK5CYII=';
function handoff(uri = `data:image/png;base64,${png}`): PromptHandoff {
  return { prompt: 'A tower', images: [{ id: 'image1', displayName: 'Tower', filename: '../../tower.png', uri }], parameters: { resolution: '480p横', durationSeconds: 8, seed: '123' }, source: { threadId: 't1', messageId: 'm1', versionId: 'v2' } };
}

describe('prompt handoff', () => {
  it('materializes data into an actual private file with safe names and correct bytes', async () => {
    const images = await materializePromptHandoff(handoff());
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ name: 'Tower', mime: 'image/png', size: 68 });
    expect(images[0].uri).toContain(Paths.document.uri);
    expect(images[0].uri).not.toContain('..');
    expect(await new File(images[0].uri!).base64()).toBe(png);
    expect(images[0].dataUri).toBeUndefined();
  });

  it('copies a local source into private storage while retaining the image label', async () => {
    const source = new File(Paths.cache, 'handoff-local.png');
    source.write(png, { encoding: 'base64' });
    const draft = handoff(source.uri);
    draft.images = [1, 2, 3].map((number) => ({ ...draft.images[0], id: `image${number}`, displayName: `图片${number}` }));
    const results = await materializePromptHandoff(draft);
    const result = results[2];
    source.delete();
    expect(result.name).toBe('图片3');
    expect(await new File(result.uri!).base64()).toBe(png);
  });

  it('rejects gaps and reordered numeric image labels instead of changing reference meaning', async () => {
    const draft = handoff();
    draft.images[0].displayName = '图片3';
    await expect(materializePromptHandoff(draft)).rejects.toThrow('连续');
    draft.images = [{ ...draft.images[0], displayName: '图片2' }, { ...draft.images[0], displayName: '图片1' }];
    await expect(materializePromptHandoff(draft)).rejects.toThrow('连续');
  });

  it('clears an explicitly blank seed instead of retaining a previous seed', () => {
    expect(resolvePromptHandoffValues({ ...handoff(), parameters: { seed: '' } }, builtinWorkflowDefinitions[1])).toEqual({ prompt: 'A tower', resolution: '768p竖', duration: 5, seed: '' });
  });

  it('resolves blank preview parameters to workflow defaults', () => {
    expect(resolvePromptHandoffValues({ ...handoff(), parameters: {} }, builtinWorkflowDefinitions[1])).toEqual({ prompt: 'A tower', resolution: '768p竖', duration: 5, seed: '' });
  });

  it.each([
    ['https://example.test/image.png', '重新添加'],
    ['data:text/html;base64,PGh0bWw+', '图片类型'],
    ['data:image/png;base64,###', '编码'],
    ['file:///missing-handoff.png', '重新添加'],
  ])('rejects unavailable or invalid media %s', async (uri, message) => {
    await expect(materializePromptHandoff(handoff(uri))).rejects.toThrow(message);
  });

  it('rejects oversized and excess references before writing files', async () => {
    const draft = handoff();
    draft.images = Array.from({ length: 10 }, () => draft.images[0]);
    await expect(materializePromptHandoff(draft)).rejects.toThrow('9');
    const huge = handoff(`data:image/png;base64,${'A'.repeat(70 * 1024 * 1024)}`);
    await expect(materializePromptHandoff(huge)).rejects.toThrow('50MB');
  });

  it('resolves exact workflow values and validates seed using the active schema', () => {
    expect(resolvePromptHandoffValues(handoff(), builtinWorkflowDefinitions[1])).toEqual({ prompt: 'A tower', resolution: '480p横', duration: 8, seed: 123 });
    expect(resolvePromptHandoffValues(handoff(), builtinWorkflowDefinitions[0]).seed).toBe('123');
  });

  it.each([{ resolution: '1080p' }, { durationSeconds: 16 }, { durationSeconds: 1.5 }, { seed: '0' }, { seed: '1e2' }])('rejects incompatible workflow parameters %j', (parameters) => {
    expect(() => resolvePromptHandoffValues({ ...handoff(), parameters }, builtinWorkflowDefinitions[1])).toThrow('交接参数');
  });

  it('rejects provided parameters missing from the active workflow', () => {
    const definition = { ...builtinWorkflowDefinitions[1], inputs: { type: 'object', properties: { prompt: { type: 'string' } } } };
    expect(() => resolvePromptHandoffValues(handoff(), definition)).toThrow('不支持');
  });
});
