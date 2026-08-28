import { describe, expect, it } from "vitest";
import { parseNativeMediaPayload } from "./nativeMediaPayload";

describe("parseNativeMediaPayload", () => {
  it("normalizes the Android picker payload into an attachment source", () => {
    expect(parseNativeMediaPayload(JSON.stringify({
      name: "reference.png",
      mime: "image/png",
      dataUri: "data:image/png;base64,AAAA",
    }))).toEqual({
      name: "reference.png",
      mimeType: "image/png",
      uri: "data:image/png;base64,AAAA",
    });
  });
});
