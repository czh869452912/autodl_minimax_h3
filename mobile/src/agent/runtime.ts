import type { ChatModelAdapter, ThreadHistoryAdapter } from '@assistant-ui/react-native';
import { officialH3Skills } from '../agentSkills.generated';
import type { SQLiteDatabase } from 'expo-sqlite';
import { readSettings } from '../settings/storage';

const skillEntries = Object.entries(officialH3Skills);
const promptSkill = skillEntries.find(([key]) => key.endsWith('/h3-prompt-writing/SKILL.md'))?.[1] as { content: string } | undefined;
const promptReferences = skillEntries.filter(([key]) => key.includes('/h3-prompt-writing/references/')).map(([key, value]) => `${key}: ${(value as { content: string }).content}`).join('\n');
const SYSTEM = `你是 AutoDL H3 Prompt 助手。遵循官方 H3 技能规范，先澄清画幅、时长、风格和参考素材，再输出可直接用于 MiniMax H3 的 integrated_multimodal_description。必须保留用户明确台词，不编造素材。以下是随 APK 发布的官方 h3-prompt-writing 技能全文与参考资料：\n${promptSkill?.content || ''}\n${promptReferences}`;

/** Converts cumulative provider deltas into the text expected by assistant-ui. */
export function normalizeCumulativeText(previous: string, next: string) {
  if (!next) return { previous, delta: '' };
  if (previous && next.startsWith(previous)) return { previous: next, delta: next.slice(previous.length) };
  return { previous: next, delta: next };
}

export function officialSkillCount() {
  return Object.keys(officialH3Skills).filter((key) => key.endsWith('/SKILL.md')).length;
}

export function createHistoryAdapter(db: SQLiteDatabase): ThreadHistoryAdapter {
  db.execSync('CREATE TABLE IF NOT EXISTS agent_messages (id TEXT PRIMARY KEY NOT NULL, parent_id TEXT, message_json TEXT NOT NULL, run_config_json TEXT, created_at INTEGER NOT NULL)');
  return {
    async load() { const rows = db.getAllSync<any>('SELECT * FROM agent_messages ORDER BY created_at ASC'); return { messages: rows.map((row: any) => ({ message: JSON.parse(row.message_json), parentId: row.parent_id, runConfig: row.run_config_json ? JSON.parse(row.run_config_json) : undefined })) }; },
    async append(item) { db.runSync('INSERT OR REPLACE INTO agent_messages (id,parent_id,message_json,run_config_json,created_at) VALUES (?,?,?,?,?)', item.message.id, item.parentId, JSON.stringify(item.message), item.runConfig ? JSON.stringify(item.runConfig) : null, Date.now()); },
    async update(item) { db.runSync('UPDATE agent_messages SET message_json=?, run_config_json=? WHERE id=?', JSON.stringify(item.message), item.runConfig ? JSON.stringify(item.runConfig) : null, item.message.id); },
    async delete(items) { for (const item of items) db.runSync('DELETE FROM agent_messages WHERE id=?', item.message.id); },
  };
}

function toOpenAIContent(message: any) {
  const parts = Array.isArray(message.content) ? message.content : [];
  const text = parts.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n');
  const media = parts.filter((part: any) => part.type === 'image' || part.type === 'file').map((part: any) => part.type === 'image' ? { type: 'image_url', image_url: { url: part.image || part.source?.url } } : { type: 'text', text: `[附件 ${part.filename || 'file'}: ${part.data || part.url || ''}]` });
  return media.length ? [{ type: 'text', text }, ...media] : text;
}

export const adapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const settings = await readSettings(); if (!settings.apiKey) throw new Error('请先在设置中配置 LLM API Key。');
    const endpoint = settings.endpoint.replace(/\/$/, '') + '/chat/completions';
    const response = await fetch(endpoint, { method: 'POST', signal: abortSignal, headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: settings.model, stream: true, messages: [{ role: 'system', content: SYSTEM }, ...messages.map((message: any) => ({ role: message.role, content: toOpenAIContent(message) }))] }) });
    if (!response.ok) throw new Error(`Agent 请求失败（${response.status}）`);
    if (!response.body) { const payload = await response.json() as any; yield { content: [{ type: 'text', text: payload.choices?.[0]?.message?.content || '' }] }; return; }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let answer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim(); if (!raw || raw === '[DONE]') continue;
        try {
          const delta = JSON.parse(raw).choices?.[0]?.delta;
          const value = typeof delta?.content === 'string' ? delta.content : Array.isArray(delta?.content) ? delta.content.map((part: any) => part?.text || '').join('') : (delta?.reasoning_content || '');
          if (value) { answer += value; yield { content: [{ type: 'text', text: answer }] }; }
        } catch { /* Ignore keep-alive and malformed provider frames. */ }
      }
    }
  },
};
