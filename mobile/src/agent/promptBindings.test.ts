import { parsePromptImageReferences, validatePromptBindings } from './promptBindings';

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
