import { ZodError } from 'zod';

const fields: Record<string, string> = { duration: '视频时长（1–15 秒）', seed: '随机种子', title: '名称', prompt: '画面描述', width: '图片宽度', height: '图片高度', steps: '生成步数', guidance: '引导强度', rescale: 'Rescale', characters: '角色设置', resolution: '分辨率' };
const messages: Record<string, string> = {
  CREDENTIAL_GENERATION_INACTIVE: '本次凭据已失效，请到设置的创作账号检查连接。',
  CREDENTIAL_GENERATION_MISMATCH: '本机保存的凭据不可用，请到设置的创作账号重新连接。',
  ACCOUNT_IDENTITY_MISMATCH: '账号信息与本次绑定不符，请连接原账号后继续。',
  DRAFT_REVISION_CONFLICT: '草稿已更新，请载入最新内容后继续。',
  DRAFT_PROVIDER_MISMATCH: '生成配置已改变，请重新打开草稿。',
  PROJECT_NOT_AVAILABLE: '项目已归档或不可用，请先返回项目恢复。',
  SHOT_NOT_AVAILABLE: '镜头已移除，请返回项目选择其他镜头。',
  SHOT_REVISION_CONFLICT: '镜头已在其他入口更新，请重新打开后编辑。',
  REVISION_CONFLICT: '内容已在其他入口更新，请重新打开后编辑。',
  DRAFT_INPUT_CHANGED: '参考图已改变，请重新确认后生成。',
  DRAFT_INPUT_NOT_AVAILABLE: '参考图原文件不可用，请重新选择或恢复文件。',
  TARGET_ASSET_TRASHED: '素材已移入回收站，请先恢复素材。',
  AUTHORIZATION_INACTIVE: '授权已过期或撤销，请重新授权。',
  REQUEST_BUDGET_EXCEEDED: '本次授权次数已用完，请重新确认生成授权。',
  UNKNOWN_COST_NOT_AUTHORIZED: '当前授权不包含未知费用，请重新确认生成授权。',
};
export function creativeError(error: unknown, fallback = '操作失败，请稍后重试') {
  if (error instanceof ZodError) {
    const names = [...new Set(error.issues.map(i => fields[String(i.path.find(p => fields[String(p)]))] ?? '输入内容'))];
    return `请检查${names.join('、')}，填写有效内容后重试。`;
  }
  if (!(error instanceof Error)) return fallback;
  if (/NativeDatabase|NativeStatement|shared object that was already released|expo\.modules\.sqlite/.test(error.message)) return '本地数据暂时读取失败，输入仍保留，请稍后重试。';
  return messages[error.message] ?? error.message;
}
