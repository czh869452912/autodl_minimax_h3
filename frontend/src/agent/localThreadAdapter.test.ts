import { describe, expect, it } from "vitest";
import {
  createH3ThreadListAdapter,
  migrateLegacyThreadStorage,
} from "./localThreadAdapter";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => void values.set(key, value),
    removeItem: async (key: string) => void values.delete(key),
  };
}

describe("local assistant-ui thread adapter", () => {
  it("stores thread metadata and preserves the assistant-ui message repository", async () => {
    const storage = createMemoryStorage();
    const adapter = createH3ThreadListAdapter(storage);
    const threadId = "thread-native";
    const initialized = await adapter.initialize(threadId);

    expect(initialized.remoteId).toBe(threadId);
    expect((await adapter.list()).threads).toEqual([
      expect.objectContaining({ remoteId: threadId, status: "regular" }),
    ]);

    const history = adapter.unstable_Provider;
    expect(history).toBeDefined();

    await adapter.rename(threadId, "Native thread");
    expect((await adapter.list()).threads[0]?.title).toBe("Native thread");

    await adapter.delete(threadId);
    expect((await adapter.list()).threads).toHaveLength(0);
  });

  it("migrates legacy linear threads into assistant-ui repository records", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    values.set(
      "h3-prompt-assistant-threads-index",
      JSON.stringify([{ threadId: "legacy-1", title: "旧对话", createdAt: 1, updatedAt: 2 }]),
    );
    values.set(
      "h3-prompt-assistant-thread:legacy-1",
      JSON.stringify({
        threadId: "legacy-1",
        createdAt: 1,
        updatedAt: 2,
        messages: [
          { id: "user-1", role: "user", content: "你好" },
          { id: "assistant-1", role: "assistant", content: [{ type: "text", text: "你好！" }] },
        ],
      }),
    );

    migrateLegacyThreadStorage(storage);

    const repository = JSON.parse(values.get("h3-prompt-assistant:messages:legacy-1")!);
    expect(repository.headId).toBe("assistant-1");
    expect(repository.messages.map((item: { parentId: string | null }) => item.parentId)).toEqual([
      null,
      "user-1",
    ]);
    expect(JSON.parse(values.get("h3-prompt-assistant:threads")!)[0]).toMatchObject({
      remoteId: "legacy-1",
      title: "旧对话",
      status: "regular",
    });
  });
});
