import { verifyAccount } from './accountVerification';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

test('image credentials use the image endpoint without changing stored identity namespace', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ active: true, tier: 3 }) });
  global.fetch = fetchMock;
  await expect(verifyAccount('novelai', 'test-secret')).resolves.toEqual({ namespace: 'https://api.novelai.net' });
  expect(fetchMock).toHaveBeenCalledWith('https://image.novelai.net/user/subscription', expect.objectContaining({ headers: { Authorization: 'Bearer test-secret' } }));
});

test('verification never surfaces provider bodies or network credential details', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('test-secret'));
  await expect(verifyAccount('novelai', 'test-secret')).rejects.toThrow('无法验证 NovelAI 账号，请检查网络与令牌');
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'test-secret' });
  await expect(verifyAccount('novelai', 'test-secret')).rejects.toThrow('NovelAI 凭据验证失败（401）');
});

test('malformed responses are rejected; AutoDL does not claim remote account verification', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ active: true }) });
  global.fetch = fetchMock;
  await expect(verifyAccount('novelai', 'test-secret')).rejects.toThrow('NovelAI 账号响应无法验证');
  fetchMock.mockClear();
  await expect(verifyAccount('autodl', 'test-secret')).resolves.toMatchObject({ authenticated: false });
  expect(fetchMock).not.toHaveBeenCalled();
});
