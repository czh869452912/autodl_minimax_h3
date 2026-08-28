import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "H3PromptResult.tsx"), "utf8");
const screenSource = readFileSync(resolve(here, "AgentScreen.tsx"), "utf8");
const styleSource = readFileSync(resolve(here, "../index.css"), "utf8");

describe("Prompt assistant chat layout contract", () => {
  it("uses the official responsive sidebar composition", () => {
    expect(source).toContain("SidebarProvider");
    expect(source).toContain("ThreadListSidebar");
    expect(source).toContain("SidebarInset");
    expect(source).toContain("SidebarTrigger");
  });

  it("does not create a second mobile timeline scroll region", () => {
    expect(source).not.toContain("grid-rows-[auto_minmax(0,1fr)]");
    expect(source).not.toContain("max-h-40 overflow-y-auto");
    expect(source).not.toContain("overflow-y-auto px-4 py-5");
  });

  it("reserves enough space for the mobile bottom navigation", () => {
    expect(screenSource).toContain("h-[100dvh]");
    expect(screenSource).toContain("w-full max-w-none");
    expect(screenSource).toContain(
      "pb-[calc(5.5rem+env(safe-area-inset-bottom))]",
    );
  });

  it("maps assistant-ui surface tokens to opaque app colors", () => {
    expect(styleSource).toContain("--color-background: var(--background);");
    expect(styleSource).toContain("--color-card: var(--surface);");
    expect(styleSource).toContain(
      "--color-popover: var(--surface-container-high);",
    );
  });

});
