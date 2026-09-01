import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const text = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('release uses external signing credentials and never debug signing', () => {
  const gradle = text('android/app/build.gradle');
  const release = gradle.match(/buildTypes\s*\{([\s\S]*?)\n\s*\}\s*\n\s*packagingOptions/)?.[1] ?? '';
  expect(gradle).toContain('AUTODL_UPLOAD_STORE_FILE');
  expect(gradle).toContain('AUTODL_UPLOAD_STORE_PASSWORD');
  expect(gradle).toContain('AUTODL_UPLOAD_KEY_ALIAS');
  expect(gradle).toContain('AUTODL_UPLOAD_KEY_PASSWORD');
  expect(release).toContain('signingConfig signingConfigs.release');
  expect(release).not.toContain('signingConfigs.debug');
});

test('production disables cleartext, backup, and overlay permission', () => {
  const app = JSON.parse(text('app.json'));
  const manifest = text('android/app/src/main/AndroidManifest.xml');
  expect(app.expo.android.usesCleartextTraffic).toBe(false);
  expect(manifest).toContain('android:usesCleartextTraffic="false"');
  expect(manifest).toContain('android:allowBackup="false"');
  expect(manifest).not.toContain('android.permission.SYSTEM_ALERT_WINDOW');
});
