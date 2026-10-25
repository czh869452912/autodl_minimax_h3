/** Display guidance only; execution and account binding stay in the provider registry. */
export function taskProviderPresentation(adapterId?: string) {
  if (adapterId === 'novelai-image') return {
    name: 'NovelAI', reviewUrl: 'https://novelai.net/image',
    reviewHint: '请检查本次生成结果和 NovelAI 消费记录。未取得生成收据不代表服务端未受理。',
  };
  // Imported historical video records may predate adapter IDs.
  if (!adapterId || adapterId === 'autodl-comfyui') return {
    name: 'AutoDL', reviewUrl: 'https://autodl.art',
    reviewHint: '请在 AutoDL 任务记录中按提交时间和描述核查。',
  };
  return { name: '服务商', reviewUrl: undefined, reviewHint: '请按提交时间和描述在原服务商核查生成结果和消费记录。' };
}
