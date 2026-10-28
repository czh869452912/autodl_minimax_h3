import {createPreviewQueue} from './previewQueue';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('deduplicates decoders, bounds concurrency, and discards offscreen queued work',async()=>{
  const queue=createPreviewQueue(2),started:string[]=[],finish=new Map<string,(uri:string)=>void>();
  const run=(id:string)=>()=>{started.push(id);return new Promise<string>(resolve=>finish.set(id,resolve));};
  const a=queue.request('a',run('a')),shared=queue.request('a',run('duplicate')),b=queue.request('b',run('b'));
  const cancelled=queue.request('c',run('c')),d=queue.request('d',run('d'));cancelled.release();
  await flush();expect(started).toEqual(['a','b']);
  finish.get('a')!('thumb-a');await flush();expect(started).toEqual(['a','b','d']);
  expect(await shared.promise).toBe('thumb-a');expect(await cancelled.promise).toBeUndefined();
  finish.get('b')!('thumb-b');finish.get('d')!('thumb-d');await flush();
  expect(await queue.request('a',run('again')).promise).toBe('thumb-a');
  a.release();shared.release();b.release();d.release();
});
test('failed previews can retry and an evicted URI is rebuilt',async()=>{
  const queue=createPreviewQueue(1,2,1),fail=jest.fn(async()=>{throw Error('codec');});
  expect(await queue.request('a',fail).promise).toBeUndefined();await flush();
  expect(await queue.request('a',async()=>'ok').promise).toBe('ok');await flush();
  queue.invalidate('a');
  expect(await queue.request('a',async()=>'rebuilt').promise).toBe('rebuilt');
});
test('a saturated queue asks visible callers to retry instead of retaining unbounded decoder work',async()=>{
  const queue=createPreviewQueue(1,1);let finish!:(uri:string)=>void;
  queue.request('running',()=>new Promise(resolve=>{finish=resolve;}));
  const waiting=queue.request('waiting',async()=>'later');
  const run=jest.fn(async()=>'visible');
  const saturated=queue.request('visible',run);
  expect(saturated.retryAfter).toBe(250);expect(await saturated.promise).toBeUndefined();
  expect(run).not.toHaveBeenCalled();waiting.release();await flush();finish('done');await flush();
  expect(await queue.request('visible',run).promise).toBe('visible');
});
