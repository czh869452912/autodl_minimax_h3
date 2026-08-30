import { evaluateCondition } from './conditions';

test('evaluates equals, in, and exists predicates against input paths', () => {
  expect(evaluateCondition({ field: 'mode', equals: 'video' }, { mode: 'video' })).toBe(true);
  expect(evaluateCondition({ field: 'mode', in: ['image', 'video'] }, { mode: 'video' })).toBe(true);
  expect(evaluateCondition({ field: 'references.image', exists: true }, { references: { image: 'asset-1' } })).toBe(true);
  expect(evaluateCondition({ field: 'mode', equals: 'image' }, { mode: 'video' })).toBe(false);
});

test('returns false for missing values and unsupported predicates', () => {
  expect(evaluateCondition({ field: 'missing', exists: true }, {})).toBe(false);
  expect(evaluateCondition({ field: 'mode', startsWith: 'v' } as never, { mode: 'video' })).toBe(false);
});
