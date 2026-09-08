/** @jest-environment node */
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { createOpenAICompatibleModel } from './modelAdapter';

const config = { apiKey: 'test-key', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash', timeoutMs: 1000, maxRetries: 0, reasoningEffort: 'max' as const, maxOutputTokens: 8192 };
const tools = [{ type: 'function' as const, function: { name: 'read_file', description: 'Read a guide', parameters: { type: 'object', properties: {} } } }];

it.each([
  ['gpt-5', 'minimal'], ['gpt-5', 'high'], ['gpt-5.1', 'none'], ['gpt-5.2', 'none'], ['o3', 'low'],
] as const)('sends Chat Completions effort for %s / %s through the actual SDK', async (model, reasoningEffort) => {
  let body: any;
  let url = '';
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    url = String(input);
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 'answer', choices: [{ index: 0, message: { role: 'assistant', content: 'Answer' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  try {
    await createOpenAICompatibleModel({ ...config, endpoint: 'https://api.openai.com/v1', model, reasoningEffort }).invoke('Hello');
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(body).toMatchObject({ model, reasoning_effort: reasoningEffort, max_completion_tokens: 8192 });
    expect(body.reasoning).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    if (reasoningEffort !== 'none') expect(body.temperature).toBeUndefined();
  } finally { fetch.mockRestore(); }
});

it.each(['gpt-5.2-codex', 'codex-mini-latest', 'gpt-5-pro'])('uses the Responses reasoning shape when the SDK selects that API: %s', async model => {
  let body: any;
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    expect(String(_url)).toBe('https://api.openai.com/v1/responses');
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 'resp_test', object: 'response', status: 'completed', output: [{ type: 'message', id: 'msg_test', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Answer', annotations: [] }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  try {
    await createOpenAICompatibleModel({ ...config, endpoint: 'https://api.openai.com/v1', model, reasoningEffort: 'high' }).invoke('Hello');
    expect(body).toMatchObject({ reasoning: { effort: 'high' }, max_output_tokens: 8192 });
    expect(body.reasoning_effort).toBeUndefined();
  } finally { fetch.mockRestore(); }
});

it.each([false, true])('sends effort and preserves reasoning across tool rounds (stream=%s)', async streaming => {
  const bodies: any[] = [];
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body)); bodies.push(body);
    const message = { role: 'assistant', content: 'Final answer', reasoning_content: 'Done' };
    return new Response(body.stream
      ? `data: ${JSON.stringify({ id: 'result', object: 'chat.completion.chunk', choices: [{ index: 0, delta: message, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'result', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`
      : JSON.stringify({ id: 'result', object: 'chat.completion', choices: [{ index: 0, message, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
    { status: 200, headers: { 'Content-Type': body.stream ? 'text/event-stream' : 'application/json' } });
  });
  try {
    const model = createOpenAICompatibleModel(config);
    const input = [new HumanMessage('Read the guide'), new AIMessage({ content: '', additional_kwargs: { reasoning_content: 'Need the guide first' }, tool_calls: [{ id: 'call', name: 'read_file', args: {} }] }), new ToolMessage({ tool_call_id: 'call', content: 'guide contents' }), new AIMessage({ content: 'Earlier reply', additional_kwargs: { reasoning_content: 'Earlier reasoning' } }), new HumanMessage('Continue')];
    if (streaming) { for await (const _chunk of await model.stream(input, { tools })) { /* Consume the actual SDK stream. */ } }
    else await model.invoke(input, { tools });
    expect(bodies[0]).toMatchObject({ model: config.model, max_tokens: 8192, reasoning_effort: 'max', thinking: { type: 'enabled' } });
    expect(bodies[0].messages[1]).toMatchObject({ role: 'assistant', reasoning_content: 'Need the guide first', tool_calls: [{ id: 'call' }] });
    expect(bodies[0].messages[3]).toMatchObject({ role: 'assistant', reasoning_content: 'Earlier reasoning' });
  } finally { fetch.mockRestore(); }
});

it.each(['default', 'none'] as const)('sends the DeepSeek %s setting without an unsupported effort value', async reasoningEffort => {
  let body: any;
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 'answer', choices: [{ index: 0, message: { role: 'assistant', content: 'Answer' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  try {
    await createOpenAICompatibleModel({ ...config, reasoningEffort }).invoke('Hello');
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.thinking).toEqual(reasoningEffort === 'none' ? { type: 'disabled' } : undefined);
  } finally { fetch.mockRestore(); }
});

it('keeps reasoning attached to its own request during concurrent calls', async () => {
  const bodies: any[] = [];
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: 'answer', choices: [{ index: 0, message: { role: 'assistant', content: 'Answer' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  try {
    const model = createOpenAICompatibleModel(config);
    await Promise.all(['A', 'B'].map(content => model.invoke([
      new AIMessage({ content, additional_kwargs: { reasoning_content: `Reasoning ${content}` } }), new HumanMessage('Continue'),
    ], { tools })));
    expect(bodies).toHaveLength(2);
    for (const body of bodies) expect(body.messages[0].reasoning_content).toBe(`Reasoning ${body.messages[0].content}`);
  } finally { fetch.mockRestore(); }
});
