jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

import { fetch as expoFetch } from 'expo/fetch';
import { downloadArtifact, resolveArtifactRedirects, validateArtifactUrl, validateDownloadResult, validateRedirectUrl } from './downloadPolicy';

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

test('allows provider-supplied public HTTPS nodes only when the adapter opts in', () => {
  const dynamicUrl = 'https://codewithgpu-image-1310972338.cos.ap-beijing.myqcloud.com/comfyui/outputs/video.mp4';
  expect(validateArtifactUrl(dynamicUrl, ['autodl.art'], true)).toBe(dynamicUrl);
  expect(() => validateArtifactUrl(dynamicUrl, ['autodl.art'])).toThrow('域名不在允许列表');
  expect(() => validateArtifactUrl('http://public.example/video.mp4', ['autodl.art'], true)).toThrow('HTTPS');
  expect(() => validateArtifactUrl('https://192.168.1.2/video.mp4', ['autodl.art'], true)).toThrow('私有网络');
});

test('rejects artifact URLs when the provider host allowlist is empty', () => {
  expect(() => validateArtifactUrl('https://public.example/video.mp4', [])).toThrow('允许列表');
  expect(() => validateArtifactUrl('https://public.example/video.mp4')).toThrow('允许列表');
});

test('rejects non-success, non-video, and oversized downloads', () => {
  expect(() => validateDownloadResult({ status: 500, headers: {}, size: 10 }, { maxBytes: 100 })).toThrow('HTTP 500');
  expect(() => validateDownloadResult({ status: 200, headers: { 'content-type': 'text/html' }, size: 10 }, { maxBytes: 100 })).toThrow('媒体类型');
  expect(() => validateDownloadResult({ status: 200, headers: { 'content-type': 'video/mp4' }, size: 101 }, { maxBytes: 100 })).toThrow('大小');
});

test('rejects missing MIME and revalidates every redirect target', () => {
  expect(() => validateDownloadResult({ status: 200, headers: {}, size: 10 })).toThrow('媒体类型');
  expect(validateRedirectUrl('https://cdn.example.test/next', ['example.test'])).toBe('https://cdn.example.test/next');
  expect(() => validateRedirectUrl('http://cdn.example.test/next', ['example.test'])).toThrow('HTTPS');
  expect(() => validateRedirectUrl('https://evil.test/next', ['example.test'])).toThrow('允许列表');
});

test('follows only allowlisted HTTPS redirects and caps hops', async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://cdn.example.test/next' } }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  await expect(resolveArtifactRedirects('https://cdn.example.test/start', { allowedHosts: ['example.test'], fetcher })).resolves.toBe('https://cdn.example.test/next');
  const unsafe = jest.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://evil.test/file' } }));
  await expect(resolveArtifactRedirects('https://cdn.example.test/start', { allowedHosts: ['example.test'], fetcher: unsafe })).rejects.toThrow('HTTPS');
});

test('dynamic provider redirects may change public nodes but never enter a private network', async () => {
  const first = 'https://node-a.public.example/start';
  const next = 'https://node-b.cdn.example/video.mp4';
  const publicRedirect = jest.fn()
    .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: next } }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  await expect(resolveArtifactRedirects(first, { allowedHosts: ['autodl.art'], allowProviderSuppliedPublicHosts: true, fetcher: publicRedirect })).resolves.toBe(next);

  const privateRedirect = jest.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://10.0.0.2/video.mp4' } }));
  await expect(resolveArtifactRedirects(first, { allowedHosts: ['autodl.art'], allowProviderSuppliedPublicHosts: true, fetcher: privateRedirect })).rejects.toThrow('私有网络');
});

test('streams the final response through the same bounded redirect chain', async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://cdn.example.test/next' } }))
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'video/mp4' } }));
  const writes: Uint8Array[] = [];
  await expect(downloadArtifact('https://cdn.example.test/start', {
    allowedHosts: ['example.test'],
    maxBytes: 3,
    acceptedMimes: ['video/mp4'],
    timeoutMs: 1000,
    fetcher,
    writer: async (chunk) => { writes.push(chunk); },
  })).resolves.toMatchObject({ size: 3, mime: 'video/mp4' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(writes).toHaveLength(1);
});

test('rejects a response stream that ends before its declared content length', async () => {
  const fetcher = jest.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'video/mp4', 'content-length': '5' },
  }));
  await expect(downloadArtifact('https://cdn.example.test/video.mp4', {
    allowedHosts: ['example.test'], fetcher, writer: jest.fn(async () => undefined),
  })).rejects.toThrow('下载文件不完整');
});

test('uses a video extension only as a missing-MIME fallback for trusted provider nodes', async () => {
  const writer = jest.fn(async () => undefined);
  const missingMime = jest.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
  await expect(downloadArtifact('https://dynamic.public.example/result.mp4', {
    allowedHosts: ['autodl.art'], allowProviderSuppliedPublicHosts: true,
    acceptedMimes: ['video/mp4'], fetcher: missingMime, writer,
  })).resolves.toMatchObject({ mime: 'video/mp4', size: 3 });

  const unknownFile = jest.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
  await expect(downloadArtifact('https://dynamic.public.example/result.bin', {
    allowedHosts: ['autodl.art'], allowProviderSuppliedPublicHosts: true,
    acceptedMimes: ['video/mp4'], fetcher: unknownFile, writer,
  })).rejects.toThrow('媒体类型');

  const explicitHtml = jest.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'text/html' } }));
  await expect(downloadArtifact('https://dynamic.public.example/result.mp4', {
    allowedHosts: ['autodl.art'], allowProviderSuppliedPublicHosts: true,
    acceptedMimes: ['video/mp4'], fetcher: explicitHtml, writer,
  })).rejects.toThrow('text/html');
});

test('uses Expo native fetch by default so Android exposes response headers and body chunks', async () => {
  const response = new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'video/mp4' } });
  jest.mocked(expoFetch).mockResolvedValueOnce(response as never);
  const globalFetcher = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response);
  try {
    await expect(downloadArtifact('https://cdn.example.test/video.mp4', {
      allowedHosts: ['example.test'], writer: jest.fn(async () => undefined),
    })).resolves.toMatchObject({ mime: 'video/mp4', size: 3 });
    expect(expoFetch).toHaveBeenCalled();
    expect(globalFetcher).not.toHaveBeenCalled();
  } finally {
    globalFetcher.mockRestore();
  }
});

test('aborts a streamed artifact when the byte limit is exceeded', async () => {
  const fetcher = jest.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'video/mp4' } }));
  const writer = jest.fn(async () => undefined);
  await expect(downloadArtifact('https://cdn.example.test/video', { allowedHosts: ['example.test'], maxBytes: 2, timeoutMs: 1000, fetcher, writer })).rejects.toThrow('大小');
  expect(writer).not.toHaveBeenCalled();
});

test('times out while the response body is stalled', async () => {
  jest.useFakeTimers();
  try {
    const reader = { read: jest.fn(() => new Promise<never>(() => undefined)), cancel: jest.fn(async () => undefined) };
    const fetcher = jest.fn().mockResolvedValue({ status: 200, ok: true, headers: new Headers({ 'content-type': 'video/mp4' }), body: { getReader: () => reader } });
    const pending = downloadArtifact('https://cdn.example.test/video', { allowedHosts: ['example.test'], timeoutMs: 10, fetcher, writer: jest.fn(async () => undefined) });
    await Promise.resolve();
    jest.advanceTimersByTime(10);
    await expect(pending).rejects.toThrow('超时');
  } finally { jest.useRealTimers(); }
});
