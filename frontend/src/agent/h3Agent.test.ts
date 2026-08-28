import { describe, expect, it } from "vitest";
import { fakeModel } from "@langchain/core/testing";
import { AIMessage } from "@langchain/core/messages";
import { createH3Agent, isAssistantMessage, normalizeCumulativeText, streamH3Agent } from "./h3Agent";

describe("in-app H3 agent", () => {
  it("only forwards assistant messages from state snapshots", () => {
    expect(isAssistantMessage({ role: "user" })).toBe(false);
    expect(isAssistantMessage({ type: "human" })).toBe(false);
    expect(isAssistantMessage({ role: "assistant" })).toBe(true);
    expect(isAssistantMessage({ type: "ai" })).toBe(true);
  });

  it("converts cumulative stream snapshots into suffix deltas", () => {
    expect(normalizeCumulativeText("", "read")).toEqual({ previous: "read", delta: "read" });
    expect(normalizeCumulativeText("read", "read official")).toEqual({
      previous: "read official",
      delta: " official",
    });
    expect(normalizeCumulativeText("read official", "new segment")).toEqual({
      previous: "new segment",
      delta: "new segment",
    });
  });

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

  it("handles real agent.stream with fakeModel extracting tools and text", async () => {
    const mock = fakeModel()
      .respondWithTools([{ name: "read_file", args: { file_path: "/skills/h3-prompt-writing/SKILL.md" } }])
      .respond(new AIMessage({ content: "Here is your generated prompt:\nintegrated_multimodal_description: Camera pushes into miniature paper forest." }));

    const events: any[] = [];
    for await (const event of streamH3Agent({
      threadId: "thread-real-stream",
      messages: [{ role: "user", content: "制作一个纸艺微缩视频提示词" }],
      signal: new AbortController().signal,
    }, {
      apiKey: "test-key",
      endpoint: "https://example.test/v1",
      model: "test-model",
    }, {
      modelFactory: () => mock as any,
    })) {
      events.push(event);
    }

    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["status", "tool-start", "tool-end", "text"]),
    );
    const textEvents = events.filter((e) => e.type === "text");
    expect(textEvents.map((e) => e.delta).join("")).toContain("integrated_multimodal_description:");
  });
});
