import { describe, expect, it } from "vitest";
import { createH3Agent, streamH3Agent } from "./h3Agent";

describe("in-app H3 agent", () => {
  it("rejects an incomplete OpenAI-compatible configuration before a request", () => {
    expect(() => createH3Agent({ apiKey: "", endpoint: "https://example.test/v1", model: "test" }))
      .toThrow("LLM API key");
  });

  it("can be created with a valid configuration without a remote runtime", () => {
    expect(createH3Agent({
      apiKey: "test-key",
      endpoint: "https://example.test/v1",
      model: "test-model",
    })).toBeDefined();
  });

  it("emits ordered text and tool events from an injected local stream", async () => {
    const events = [];
    for await (const event of streamH3Agent({
      threadId: "thread-1",
      messages: [{ role: "user", content: "写一个纸艺科普视频提示词" }],
      signal: new AbortController().signal,
    }, {
      apiKey: "test-key",
      endpoint: "https://example.test/v1",
      model: "test-model",
    }, {
      agentFactory: async function* () {
        yield { type: "tool-start", id: "call-1", name: "read_file", args: { file_path: "/skills/h3-prompt-writing/SKILL.md" } };
        yield { type: "tool-end", id: "call-1" };
        yield { type: "text", delta: "第一轮分析" };
        yield { type: "text", delta: "第二轮迭代" };
      },
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "tool-start",
      "tool-end",
      "text",
      "text",
    ]);
    expect(events[0]).toMatchObject({ name: "read_file" });
  });
});
