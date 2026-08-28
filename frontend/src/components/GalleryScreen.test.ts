import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "GalleryScreen.tsx"), "utf8");

describe("gallery video previews", () => {
  it("preloads and decodes the first video frame for card previews", () => {
    expect(source).toContain('preload="auto"');
    expect(source).toMatch(/onLoadedData|onCanPlay/);
    expect(source).toContain("currentTime = 0");
    expect(source).toContain("查看详情");
    expect(source).toContain("aria-label");
  });
});
