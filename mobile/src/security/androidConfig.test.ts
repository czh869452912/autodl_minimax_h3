import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const text = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('release uses external signing credentials and never debug signing', () => {
  const gradle = text('android/app/build.gradle');
  const release = gradle.match(/buildTypes\s*\{[\s\S]*?\brelease\s*\{([\s\S]*?)\n        \}/)?.[1] ?? '';
  expect(release).not.toBe('');
  expect(gradle).toContain('AUTODL_UPLOAD_STORE_FILE');
  expect(gradle).toContain('AUTODL_UPLOAD_STORE_PASSWORD');
  expect(gradle).toContain('AUTODL_UPLOAD_KEY_ALIAS');
  expect(gradle).toContain('AUTODL_UPLOAD_KEY_PASSWORD');
  expect(release).toContain('signingConfig signingConfigs.release');
  expect(release).not.toContain('signingConfigs.debug');
});

test('beta Expo identity is isolated and leaves production config unchanged', () => {
  const configure = require('../../app.config');
  const config = JSON.parse(text('app.json')).expo;
  const previous = process.env.AUTODL_BUILD_VARIANT;
  try {
    delete process.env.AUTODL_BUILD_VARIANT;
    expect(configure({ config })).toBe(config);
    process.env.AUTODL_BUILD_VARIANT = 'beta';
    expect(configure({ config })).toMatchObject({
      name: 'AutoDL H3 测试版', scheme: 'autodlh3-beta',
      android: { package: 'com.example.autodlh3.beta' },
    });
    expect(config.android.package).toBe('com.example.autodlh3');
    expect(config.scheme).toBe('autodlh3');
  } finally {
    if (previous === undefined) delete process.env.AUTODL_BUILD_VARIANT;
    else process.env.AUTODL_BUILD_VARIANT = previous;
  }
});

test('production disables cleartext, backup, and overlay permission', () => {
  const app = JSON.parse(text('app.json'));
  const manifest = text('android/app/src/main/AndroidManifest.xml');
  expect(app.expo.android.usesCleartextTraffic).toBe(false);
  expect(manifest).toContain('android:usesCleartextTraffic="false"');
  expect(manifest).toContain('android:allowBackup="false"');
  expect(manifest).not.toContain('android.permission.SYSTEM_ALERT_WINDOW');
});
