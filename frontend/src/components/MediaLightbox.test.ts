import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(here, "MediaLightbox.tsx");

describe("result media lightbox", () => {
  it("uses the maintained lightbox shell and keeps details independently scrollable", () => {
    expect(existsSync(componentPath)).toBe(true);
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain('from "yet-another-react-lightbox"');
    expect(source).toContain('from "yet-another-react-lightbox/plugins/video"');
    expect(source).toContain('from "yet-another-react-lightbox/plugins/fullscreen"');
    expect(source).toContain("aspect-video");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("onClose");
    expect(source).toContain("复制 Prompt");
    expect(source).toContain("在生成页重用此 Prompt");
  });

  it("routes App results through the lightbox", () => {
    const appSource = readFileSync(resolve(here, "../App.tsx"), "utf8");
    expect(appSource).toContain("MediaLightbox");
    expect(appSource).not.toContain("<VideoModal");
    expect(appSource).toContain("GalleryItem | VideoTask | null");
  });
});
