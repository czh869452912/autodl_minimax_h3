import { createBackgroundRegistration } from './backgroundRegistration';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
test('coalesces requests and distinguishes query and registration failures without leaking errors', async () => {
  const query = jest.fn<Promise<boolean>, []>().mockRejectedValueOnce(new Error('secret')).mockResolvedValue(false);
  const register = jest.fn<Promise<void>, []>().mockRejectedValueOnce(new Error('private')).mockResolvedValue(undefined);
  const registration = createBackgroundRegistration({ isRegistered: query, register, now: () => 10 });
  const first = registration.ensure();
  expect(registration.ensure()).toBe(first);
  await expect(first).resolves.toBe(false);
  expect(registration.getSnapshot()).toEqual({ phase: 'failed', error: 'BACKGROUND_QUERY_FAILED', lastAttemptAt: 10 });
  await registration.retry();
  expect(registration.getSnapshot().error).toBe('BACKGROUND_REGISTER_FAILED');
  await registration.retry();
  expect(registration.getSnapshot().phase).toBe('registered');
  expect(register).toHaveBeenCalledTimes(2);
});
test('bounds retries and cancels timers while backgrounded or disposed', async () => {
  const query = jest.fn(async () => { throw new Error('offline'); });
  const registration = createBackgroundRegistration({ isRegistered: query, register: jest.fn() });
  registration.resume();
  await jest.runAllTimersAsync();
  expect(query).toHaveBeenCalledTimes(4);
  registration.resume();
  await Promise.resolve(); await Promise.resolve();
  registration.pause();
  await jest.runAllTimersAsync();
  expect(query).toHaveBeenCalledTimes(5);
  registration.stop();
});
test('disposal during query prevents native registration', async () => {
  let resolve!: (value: boolean) => void;
  const register = jest.fn();
  const registration = createBackgroundRegistration({ isRegistered: () => new Promise(r => { resolve = r; }), register });
  const work = registration.ensure();
  registration.stop();
  resolve(false);
  await work;
  expect(register).not.toHaveBeenCalled();
});

test('strict effect replay resumes after an obsolete in-flight query settles', async () => {
  let resolve!: (value: boolean) => void;
  const query = jest.fn<Promise<boolean>, []>().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(true);
  const registration = createBackgroundRegistration({ isRegistered: query, register: jest.fn() });
  registration.resume(); registration.stop(); registration.resume();
  resolve(false);
  await jest.runAllTimersAsync();
  expect(registration.getSnapshot().phase).toBe('registered');
  expect(query).toHaveBeenCalledTimes(2);
  registration.stop();
});

test('an explicit ensure consumes an armed backoff instead of leaving a redundant retry', async () => {
  const query = jest.fn<Promise<boolean>, []>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
  const registration = createBackgroundRegistration({ isRegistered: query, register: jest.fn() });
  registration.resume();
  await Promise.resolve(); await Promise.resolve();
  await registration.ensure();
  await jest.runAllTimersAsync();
  expect(query).toHaveBeenCalledTimes(2);
  expect(registration.getSnapshot().phase).toBe('registered');
  registration.stop();
});
