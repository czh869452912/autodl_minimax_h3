import { parsePromptImageReferences, preparePromptExport, validatePromptBindings } from '../handoff/promptBindings';

const image = (id: string, displayName: string, ordinal?: number) => ({ id, displayName, uri: `file://${id}`, ...(ordinal ? { ordinal } : {}) });

it('unifies Chinese and English image references and aliases', () => {
  const references = parsePromptImageReferences('@图片 2, <Picture 2>, @Picture 1, <图片1>');
  expect(references.map(reference => reference.ordinal)).toEqual([2, 1]);
  expect(validatePromptBindings('@图片1 and <Picture 2>', [image('b', 'Picture 2'), image('a', '图片1')])).toMatchObject({ ok: true, images: [{ id: 'a', ordinal: 1 }, { id: 'b', ordinal: 2 }] });
});

it('requires explicit identities and ordinals instead of guessing referenced image positions', () => {
  expect(validatePromptBindings('@图片1', [image('a', 'Reference')])).toMatchObject({ ok: false, missing: [1] });
  expect(validatePromptBindings('@图片1', [{ ...image('a', '图片1'), identityKnown: false }])).toMatchObject({ ok: false });
  expect(validatePromptBindings('@图片1', [image('a', 'Reference', 1)])).toMatchObject({ ok: true });
});

it('rejects duplicate aliases, conflicting explicit ordinals, gaps and duplicate identities', () => {
  for (const images of [
    [image('a', '图片1'), image('b', 'Picture 1')],
    [image('a', '图片1', 2)],
    [image('b', 'Picture 2')],
    [image('a', '图片1'), image('a', '图片2')],
  ]) expect(validatePromptBindings('<Picture 2>', images).ok).toBe(false);
});

it('remaps sparse conversation references and images together without changing the source', () => {
  const source = [image('second', '图片12'), image('first', '图片2')];
  const prompt = '@图片12 follows <Picture 2>, @Picture 12 and <图片2>.';
  const result = preparePromptExport(prompt, source);
  expect(result).toMatchObject({ ok: true, prompt: '@图片2 follows <Picture 1>, @Picture 2 and <图片1>.', images: [
    { id: 'first', displayName: '图片1', ordinal: 1 }, { id: 'second', displayName: '图片2', ordinal: 2 },
  ] });
  expect(validatePromptBindings(result.prompt, result.images).ok).toBe(true);
  expect(source.map(image => image.displayName)).toEqual(['图片12', '图片2']);
});

it('never repairs missing or ambiguous references by guessing', () => {
  for (const source of [[image('one', '图片1')], [image('a', '图片2'), image('b', '图片2')]]) {
    expect(preparePromptExport('@图片2', source)).toMatchObject({ ok: false, prompt: '@图片2' });
  }
});

it('assigns continuous export positions to mixed numbered and legacy images without references', () => {
  const legacy = { ...image('legacy', '未绑定图片'), identityKnown: false };
  const source = [legacy, image('numbered', '图片7')];
  const result = preparePromptExport('A quiet landscape.', source);
  expect(result).toMatchObject({ ok: true, prompt: 'A quiet landscape.', images: [
    { id: 'numbered', displayName: '图片1', ordinal: 1 },
    { id: 'legacy', displayName: '未绑定图片', ordinal: 2, identityKnown: false },
  ] });
  expect(validatePromptBindings(result.prompt, result.images).ok).toBe(true);
  expect(legacy.ordinal).toBeUndefined();
  expect(source[1].displayName).toBe('图片7');
  expect(preparePromptExport('@图片7', source).ok).toBe(false);
});

it('assigns export positions to entirely unnumbered images without guessing numeric references', () => {
  const source = [image('a', 'Reference'), image('b', '未绑定图片')];
  const result = preparePromptExport('A quiet landscape.', source);
  expect(result.images.map(image => image.ordinal)).toEqual([1, 2]);
  expect(validatePromptBindings(result.prompt, result.images).ok).toBe(true);
  expect(preparePromptExport('@图片1', source)).toMatchObject({ ok: false, missing: [1] });
});
