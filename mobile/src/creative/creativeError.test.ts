import {creativeError} from './creativeError';
test('native database failures show a recovery message instead of bridge internals',()=>{
  const error=new Error("Call to function NativeDatabase.prepareAsync rejected: Cannot use shared object that was already released");
  expect(creativeError(error)).toBe('本地数据暂时读取失败，输入仍保留，请稍后重试。');
  expect(creativeError(new Error('DRAFT_REVISION_CONFLICT'))).toContain('草稿已更新');
});
