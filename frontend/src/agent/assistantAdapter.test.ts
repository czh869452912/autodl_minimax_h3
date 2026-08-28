import { describe, expect, it, vi } from "vitest";
import { createH3ChatModelAdapter, messageContent, toAgentMessages } from "./assistantAdapter";

const streamH3AgentMock = vi.hoisted(() => vi.fn());
vi.mock("./h3Agent", () => ({ streamH3Agent: streamH3AgentMock }));

describe("assistant-ui local adapter", () => {
  it("separates thinking parts from the final output part", async () => {
    streamH3AgentMock.mockReturnValue((async function* () {
      yield { type: "text", delta: "先检查参考图\n" };
      yield { type: "text", delta: "integrated_multimodal_description: 最终画面" };
    })());
    const adapter = createH3ChatModelAdapter({ apiKey: "key", endpoint: "https://example.test/v1", model: "model" });
    const stream = adapter.run({
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] as any,
      runConfig: {} as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
      unstable_threadId: "thread-thinking",
      unstable_getMessage: () => ({ role: "user", content: [] } as any),
    }) as AsyncGenerator<any>;
    const updates = [];
    for await (const update of stream) updates.push(update);

    expect(updates[0]).toEqual({
      content: [{ type: "reasoning", text: "先检查参考图\n" }],
    });
    expect(updates[1]).toEqual({
      content: [
        { type: "reasoning", text: "先检查参考图\n" },
        { type: "text", text: "integrated_multimodal_description: 最终画面" },
      ],
    });
  });

  it("handles a final output marker split across stream chunks", async () => {
    streamH3AgentMock.mockReturnValue((async function* () {
      yield { type: "text", delta: "integrated_multi" };
      yield { type: "text", delta: "modal_description: 最终" };
    })());
    const adapter = createH3ChatModelAdapter({ apiKey: "key", endpoint: "https://example.test/v1", model: "model" });
    const stream = adapter.run({
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] as any,
      runConfig: {} as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
      unstable_threadId: "thread-split-marker",
      unstable_getMessage: () => ({ role: "user", content: [] } as any),
    }) as AsyncGenerator<any>;
    const updates = [];
    for await (const update of stream) updates.push(update);

    expect(updates.at(-1)).toEqual({
      content: [{ type: "text", text: "integrated_multimodal_description: 最终" }],
    });
  });

  it("returns cumulative text snapshots for assistant-ui streaming", async () => {
    streamH3AgentMock.mockReturnValue((async function* () {
      yield { type: "text", delta: "最" };
      yield { type: "text", delta: "终" };
      yield { type: "text", delta: "输出" };
    })());
    const adapter = createH3ChatModelAdapter({ apiKey: "key", endpoint: "https://example.test/v1", model: "model" });
    const stream = adapter.run({
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] as any,
      runConfig: {} as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
      unstable_threadId: "thread-stream",
      unstable_getMessage: () => ({ role: "user", content: [] } as any),
    }) as AsyncGenerator<any>;
    const updates = [];
    for await (const update of stream) updates.push(update);

    expect(updates).toEqual([
      { content: [{ type: "reasoning", text: "最" }] },
      { content: [{ type: "reasoning", text: "最终" }] },
      { content: [{ type: "reasoning", text: "最终输出" }] },
      { content: [{ type: "text", text: "最终输出" }] },
    ]);
  });

  it("includes completed assistant-ui image attachments in the model message", () => {
    const image = "data:image/png;base64,ZmFrZQ==";
    const message = {
      role: "user",
      content: [{ type: "text", text: "用这张图生成提示词" }],
      attachments: [{
        id: "attachment-1",
        type: "image",
        name: "reference.png",
        contentType: "image/png",
        status: { type: "complete" },
        content: [{ type: "image", image }],
      }],
    } as any;

    expect(messageContent(message)).toEqual([
      { type: "text", text: "用这张图生成提示词" },
      { type: "image_url", image_url: { url: image } },
    ]);
    expect(toAgentMessages([message])).toEqual([{
      role: "user",
      content: [
        { type: "text", text: "用这张图生成提示词" },
        { type: "image_url", image_url: { url: image } },
      ],
    }]);
  });

  it("passes the image part through the adapter request sent to the agent", async () => {
    streamH3AgentMock.mockReturnValue((async function* () {
      yield { type: "text", delta: "收到图片" };
    })());
    const image = "data:image/jpeg;base64,anBlZw==";
    const adapter = createH3ChatModelAdapter({ apiKey: "key", endpoint: "https://example.test/v1", model: "model" });
    const stream = adapter.run({
      messages: [{
        role: "user",
        content: [{ type: "text", text: "分析图片" }],
        attachments: [{
          id: "attachment-2",
          type: "image",
          name: "reference.jpg",
          status: { type: "complete" },
          content: [{ type: "image", image }],
        }],
      }] as any,
      runConfig: {} as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
      unstable_threadId: "thread-image",
      unstable_getMessage: () => ({ role: "user", content: [] } as any),
    }) as AsyncGenerator<any>;
    for await (const _update of stream) {
      // consume the adapter stream so the agent request is made
    }

    expect(streamH3AgentMock).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-image",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "分析图片" },
          { type: "image_url", image_url: { url: image } },
        ],
      }],
    }), expect.anything());
  });

  it("maps local agent text and tool events into assistant-ui updates", async () => {
    streamH3AgentMock.mockReturnValue((async function* () {
      yield { type: "status", message: "Reading official H3 skills" };
      yield { type: "tool-start", id: "call-1", name: "read_file", args: { file_path: "/skills/h3-prompt-writing/SKILL.md" } };
      yield { type: "text", delta: "integrated_multimodal_description: local result" };
    })());

    const adapter = createH3ChatModelAdapter({ apiKey: "key", endpoint: "https://example.test/v1", model: "model" });
    const updates = [];
    const stream = adapter.run({
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] as any,
      runConfig: {} as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
      unstable_threadId: "thread-1",
      unstable_getMessage: () => ({ role: "user", content: [] } as any),
    }) as AsyncGenerator<any>;
    for await (const update of stream) {
      updates.push(update);
    }

    expect(streamH3AgentMock).toHaveBeenCalledWith(expect.objectContaining({ threadId: "thread-1" }), expect.anything());
    expect(updates).toEqual([
      { content: [expect.objectContaining({ type: "tool-call", toolCallId: "call-1", toolName: "read_file" })] },
      { content: [
        expect.objectContaining({ type: "tool-call", toolCallId: "call-1", toolName: "read_file" }),
        { type: "text", text: "integrated_multimodal_description: local result" },
      ] },
    ]);
  });
});
