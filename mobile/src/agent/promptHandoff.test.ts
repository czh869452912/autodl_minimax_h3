import { Directory, File, Paths } from 'expo-file-system';
import { materializePromptHandoff, normalizePromptHandoffParameters, resolvePromptHandoffValues, type PromptHandoff } from './promptHandoff';
import { builtinWorkflowDefinitions } from '../workflows/registry/builtin';
import { createInitializedRealSqliteTestDb } from '../test/realSqlite';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4XcAAAAASUVORK5CYII=';
const hash = 'c'.repeat(64);
let db: ReturnType<typeof createInitializedRealSqliteTestDb>;
beforeEach(() => {
  db = createInitializedRealSqliteTestDb();
  new Directory(Paths.document, 'cas/sha256/cc').create({ intermediates: true, idempotent: true });
  const file = new File(Paths.document, `cas/sha256/cc/${hash}`);
  file.write(png, { encoding: 'base64' });
  db.runSync('INSERT INTO artifact_blobs VALUES(?,?,?,?,?,?)', hash, 68, 'image/png', `cas/sha256/cc/${hash}`, 1, 1);
});
afterEach(() => { db.close(); });
const materialize = (value: PromptHandoff) => materializePromptHandoff(value, db as never);
function handoff(uri = `asset://${hash}`): PromptHandoff {
  return { prompt: 'A tower', images: [{ id: 'image1', displayName: 'Tower', filename: '../../tower.png', uri }], parameters: { resolution: '480p横', durationSeconds: 8, seed: '123' }, source: { threadId: 't1', messageId: 'm1', versionId: 'v2' } };
}

describe('prompt handoff', () => {
  it('materializes data into an actual private file with safe names and correct bytes', async () => {
    const images = await materialize(handoff());
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ name: 'Tower', mime: 'image/png', size: 68 });
    expect(images[0].uri).toContain(Paths.document.uri);
    expect(images[0].uri).not.toContain('..');
    expect(await new File(images[0].uri!).base64()).toBe(png);
    expect(images[0].dataUri).toBeUndefined();
  });

  it('reuses the same verified CAS files on repeated materialization while retaining labels', async () => {
    const draft = handoff();
    draft.images = [1, 2, 3].map((number) => ({ ...draft.images[0], id: `image${number}`, displayName: `图片${number}` }));
    const results = await materialize(draft);
    const result = results[2];
    expect(await materialize(draft)).toEqual(results);
    expect(result.name).toBe('图片3');
    expect(await new File(result.uri!).base64()).toBe(png);
  });

  it('rejects gaps and reordered numeric image labels instead of changing reference meaning', async () => {
    const draft = handoff();
    draft.images[0].displayName = '图片3';
    await expect(materialize(draft)).rejects.toThrow('连续');
    draft.images = [{ ...draft.images[0], displayName: '图片2' }, { ...draft.images[0], displayName: '图片1' }];
    await expect(materialize(draft)).rejects.toThrow('连续');
  });

  it('clears an explicitly blank seed instead of retaining a previous seed', () => {
    expect(resolvePromptHandoffValues({ ...handoff(), parameters: { seed: '' } }, builtinWorkflowDefinitions[1])).toEqual({ prompt: 'A tower', resolution: '768p竖', duration: 5, seed: '' });
  });

  it('resolves blank preview parameters to workflow defaults', () => {
    expect(resolvePromptHandoffValues({ ...handoff(), parameters: {} }, builtinWorkflowDefinitions[1])).toEqual({ prompt: 'A tower', resolution: '768p竖', duration: 5, seed: '' });
  });

  it.each([
    ['https://example.test/image.png', '重新添加'],
    ['data:text/html;base64,PGh0bWw+', '重新添加'],
    ['data:image/png;base64,###', '重新添加'],
    ['file:///missing-handoff.png', '重新添加'],
  ])('rejects unavailable or invalid media %s', async (uri, message) => {
    await expect(materialize(handoff(uri))).rejects.toThrow(message);
  });

  it('rejects oversized and excess references before writing files', async () => {
    const draft = handoff();
    draft.images = Array.from({ length: 10 }, () => draft.images[0]);
    await expect(materialize(draft)).rejects.toThrow('9');
    db.runSync('UPDATE artifact_blobs SET byte_size=?', 21 * 1024 * 1024);
    await expect(materialize(handoff())).rejects.toThrow('20MB');
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

it('validates English and Chinese reference bindings with the same rules during materialization', async () => {
  const draft = handoff();
  draft.prompt = '<Picture 2>';
  draft.images[0].displayName = 'Picture 2';
  await expect(materialize(draft)).rejects.toThrow('连续');
  draft.images[0].displayName = 'Reference';
  await expect(materialize(draft)).rejects.toThrow('绑定');
  draft.prompt = '@图片1';
  draft.images[0].ordinal = 1;
  await expect(materialize(draft)).resolves.toHaveLength(1);
});

it('normalizes preview parameters against the chosen workflow and preserves only supplied overrides', () => {
  const definition = { ...builtinWorkflowDefinitions[1], inputs: { type: 'object', properties: {
    prompt: { type: 'string' }, resolution: { type: 'string', enum: ['custom'], default: 'custom' },
    duration: { type: 'integer', minimum: 20, maximum: 30, default: 20 }, seed: { type: 'integer', minimum: 0, maximum: 99 },
  } } };
  expect(normalizePromptHandoffParameters({ resolution: 'custom', durationSeconds: 25, seed: '0007' }, definition)).toEqual({ resolution: 'custom', durationSeconds: 25, seed: '7' });
  expect(normalizePromptHandoffParameters({}, definition)).toEqual({});
  expect(() => normalizePromptHandoffParameters({ durationSeconds: 15 }, definition)).toThrow('交接参数');
});

it('rejects missing referenced bindings before compiling the final handoff values', () => {
  const draft = { ...handoff(), prompt: '<Picture 2>' };
  expect(() => resolvePromptHandoffValues(draft, builtinWorkflowDefinitions[1])).toThrow('绑定');
});
