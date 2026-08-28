import { describe, expect, it, vi } from "vitest";
import { createAttachmentObjectUrl } from "./use-attachment-src";

describe("attachment object URL guard", () => {
  it("does not pass hydrated plain objects to URL.createObjectURL", () => {
    const createObjectUrl = vi.fn(() => "blob:should-not-be-created");

    expect(
      createAttachmentObjectUrl(
        { name: "legacy-image.png", type: "image/png" },
        createObjectUrl,
      ),
    ).toBeUndefined();
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it("creates an object URL for a real Blob attachment", () => {
    const createObjectUrl = vi.fn(() => "blob:attachment");

    expect(createAttachmentObjectUrl(new Blob(["image"]), createObjectUrl)).toBe(
      "blob:attachment",
    );
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("swallows browser object URL failures", () => {
    const createObjectUrl = vi.fn(() => {
      throw new TypeError("Overload resolution failed.");
    });

    expect(createAttachmentObjectUrl(new Blob(["image"]), createObjectUrl)).toBe(
      undefined,
    );
  });
});
