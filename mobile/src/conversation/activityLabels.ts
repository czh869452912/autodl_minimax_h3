import type { PromptRun } from './types';
export const RUN_LABELS: Record<PromptRun['status'], string> = {
  queued: '等待运行', running: '生成中', completed: '已完成', failed: '失败', cancelled: '已停止', interrupted: '已中断',
};
export function toolActivity(name: string): string {
  const labels: Record<string, string> = { propose_prompt: '整理修改建议', validate_prompt: '检查提示词约束', search_tags: '查询官方标签', read_file: '读取写作规范', write_file: '整理创作方案', edit_file: '修订创作方案', write_todos: '规划创作步骤', task: '执行创作子任务', ls: '查找参考资料', glob: '查找参考资料', grep: '检索参考资料' };
  Object.assign(labels, { creative_context:'读取项目信息', asset_search:'查找项目素材', asset_read_text:'读取参考文本', asset_save_text:'保存创作文本', draft_get:'查看生成草稿', draft_createImage:'准备图片草稿', draft_updateImage:'调整图片草稿', draft_createVideo:'准备视频草稿', draft_updateVideo:'调整视频草稿', generation_submit:'提交生成任务', generation_status:'查询生成进度' });
  return labels[name] ?? `执行 ${name}`;
}
