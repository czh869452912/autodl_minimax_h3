import { describe, expect, it } from "vitest";
import { ensureStructuredPromptCodeBlock } from "./MarkdownRenderer";

describe("structured prompt markdown", () => {
  it("wraps an un-fenced final prompt and keeps assumptions outside", () => {
    const content = "integrated_multimodal_description: paper forest\nscene_description: slow push-in\n\nAssumptions:\n- 16:9";
    expect(ensureStructuredPromptCodeBlock(content)).toBe(
      "```\nintegrated_multimodal_description: paper forest\nscene_description: slow push-in\n```\n\nAssumptions:\n- 16:9",
    );
  });

  it("does not alter content that already contains a markdown fence", () => {
    const content = "```\nintegrated_multimodal_description: paper forest\n```";
    expect(ensureStructuredPromptCodeBlock(content)).toBe(content);
  });
});
