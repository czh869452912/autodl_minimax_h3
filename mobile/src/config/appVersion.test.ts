import { APP_VERSION } from './appVersion';
import packageJson from '../../package.json';

test('runtime app version matches the package release version', () => {
  expect(APP_VERSION).toBe(packageJson.version);
});
