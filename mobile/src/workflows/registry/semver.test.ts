import { satisfiesVersion, compareVersions } from './semver';

test('compares versions and supports common compatibility ranges', () => {
  expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
  expect(satisfiesVersion('1.5.0', '^1.4.0')).toBe(true);
  expect(satisfiesVersion('2.0.0', '^1.4.0')).toBe(false);
  expect(satisfiesVersion('1.4.5', '>=1.4.0')).toBe(true);
  expect(satisfiesVersion('1.4.5', '~1.4.0')).toBe(true);
  expect(satisfiesVersion('0.2.5', '^0.2.0')).toBe(true);
  expect(satisfiesVersion('0.9.0', '^0.2.0')).toBe(false);
});
