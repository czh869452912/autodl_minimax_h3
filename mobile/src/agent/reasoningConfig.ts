export type ReasoningEffort = 'default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const labels: Record<ReasoningEffort, string> = {
  default: '服务商默认', none: '关闭（none）', minimal: '极低（minimal）', low: '低（low）',
  medium: '中（medium）', high: '高（high）', xhigh: '极高（xhigh）', max: '最高（max）',
};

export function isDeepSeekV4(model: string): boolean {
  return /(?:^|\/)deepseek-v4-(?:flash|pro)(?:$|[-:])/i.test(model.trim());
}

// Official model-specific effort ranges; strip only dated snapshots so custom
// aliases and future models keep the provider-compatible fallback.
// https://developers.openai.com/api/docs/models/gpt-5.1 (checked 2026-09-08)
const openAIEfforts: Record<string, ReasoningEffort[]> = {
  'gpt-5': ['minimal', 'low', 'medium', 'high'],
  'gpt-5-mini': ['minimal', 'low', 'medium', 'high'],
  'gpt-5-nano': ['minimal', 'low', 'medium', 'high'],
  'gpt-5.1': ['none', 'low', 'medium', 'high'],
  'gpt-5.2': ['none', 'low', 'medium', 'high', 'xhigh'],
  'gpt-5-pro': ['high'],
  'gpt-5.2-pro': ['medium', 'high', 'xhigh'],
  o1: ['low', 'medium', 'high'],
  o3: ['low', 'medium', 'high'],
  'o3-mini': ['low', 'medium', 'high'],
  'o4-mini': ['low', 'medium', 'high'],
};

export function reasoningOptions(model: string): { value: ReasoningEffort; label: string }[] {
  const modelId = model.trim().replace(/-\d{4}-\d{2}-\d{2}$/, '');
  const known = Object.hasOwn(openAIEfforts, modelId) ? openAIEfforts[modelId] : undefined;
  const values: ReasoningEffort[] = isDeepSeekV4(model)
    ? ['default', 'none', 'low', 'high', 'max']
    : known ? ['default', ...known] : ['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
  return values.map(value => ({ value, label: labels[value] }));
}

export function validateReasoningEffort(model: string, effort: string = 'default'): asserts effort is ReasoningEffort {
  if (!reasoningOptions(model).some(option => option.value === effort)) throw new Error('当前模型不支持所选思考强度，请在高级设置中重新选择或使用服务商默认值');
}

export function reasoningRequestFields(model: string, effort: ReasoningEffort = 'default'): Record<string, unknown> {
  validateReasoningEffort(model, effort);
  if (effort === 'default') return {};
  if (isDeepSeekV4(model)) return effort === 'none'
    ? { thinking: { type: 'disabled' } }
    : { thinking: { type: 'enabled' }, reasoning_effort: effort };
  // LangChain's reasoningEffort is ignored for models it does not recognize.
  return { reasoning_effort: effort };
}
