import { validateArtifactUrl, validateDownloadResult } from './downloadPolicy';

test.each([
  'http://cdn.example.test/video.mp4',
  'https://localhost/video.mp4',
  'https://127.0.0.1/video.mp4',
  'https://192.168.1.2/video.mp4',
  'file:///private/video.mp4',
])('rejects unsafe artifact URL %s', (url) => {
  expect(() => validateArtifactUrl(url)).toThrow();
});

test('enforces an adapter-provided artifact host list', () => {
  expect(validateArtifactUrl('https://cdn.example.test/video.mp4', ['example.test'])).toBe('https://cdn.example.test/video.mp4');
  expect(() => validateArtifactUrl('https://cdn.other.test/video.mp4', ['example.test'])).toThrow('域名不在允许列表');
});

test('rejects non-success, non-video, and oversized downloads', () => {
  expect(() => validateDownloadResult({ status: 500, headers: {}, size: 10 }, { maxBytes: 100 })).toThrow('HTTP 500');
  expect(() => validateDownloadResult({ status: 200, headers: { 'content-type': 'text/html' }, size: 10 }, { maxBytes: 100 })).toThrow('媒体类型');
  expect(() => validateDownloadResult({ status: 200, headers: { 'content-type': 'video/mp4' }, size: 101 }, { maxBytes: 100 })).toThrow('大小');
});
