import { describe, expect, it, vi } from "vitest";
import { createH3ChatModelAdapter } from "./assistantAdapter";

const streamH3AgentMock = vi.hoisted(() => vi.fn());
vi.mock("./h3Agent", () => ({ streamH3Agent: streamH3AgentMock }));

describe("assistant-ui local adapter", () => {
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
    expect(updates).toEqual(expect.arrayContaining([
      { content: [{ type: "text", text: "integrated_multimodal_description: local result" }] },
      expect.objectContaining({ content: [expect.objectContaining({ type: "tool-call", toolCallId: "call-1", toolName: "read_file" })] }),
    ]));
  });
});
