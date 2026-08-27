import { beforeEach, describe, expect, it } from "vitest";
import { loadThread, saveThread } from "./threadStore";

if (!globalThis.localStorage) {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
}

describe("local prompt assistant thread store", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips sanitized thread messages and final prompt", () => {
    saveThread({
      threadId: "thread-1",
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] } as any],
      finalPrompt: "integrated_multimodal_description: result",
    });

    expect(loadThread()).toMatchObject({
      threadId: "thread-1",
      finalPrompt: "integrated_multimodal_description: result",
    });
  });

  it("discards corrupt persisted data so the page can start a new thread", () => {
    localStorage.setItem("h3-prompt-assistant-thread", "{not-json");
    expect(loadThread()).toBeNull();
    expect(localStorage.getItem("h3-prompt-assistant-thread")).toBeNull();
  });

  it("accepts a UTF-8 BOM around a valid persisted record", () => {
    saveThread({
      threadId: "thread-bom",
      messages: [],
      finalPrompt: null,
    });
    const value = localStorage.getItem("h3-prompt-assistant-thread");
    localStorage.setItem("h3-prompt-assistant-thread", `\uFEFF${value}`);
    expect(loadThread()?.threadId).toBe("thread-bom");
  });
});
