import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "GalleryScreen.tsx"), "utf8");

describe("gallery video previews", () => {
  it("renders the native-generated poster without mounting gallery video players", () => {
    expect(source).toContain("item.thumbnailUrl");
    expect(source).toContain('loading="lazy"');
    expect(source).not.toContain('<video');
    expect(source).toContain("查看详情");
    expect(source).toContain("aria-label");
  });
});
