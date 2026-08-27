import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("browser agent bundle boundary", () => {
  it("does not depend on a remote agent runtime", () => {
    const root = join(process.cwd(), "src");
    const browserFiles = [
      "agent/h3Agent.ts",
      "agent/assistantAdapter.ts",
      "components/H3PromptResult.tsx",
    ];
    for (const file of browserFiles) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).not.toMatch(/@copilotkit|express|deepagents\/node|\/api\/copilotkit|server\//);
    }
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.dependencies).not.toHaveProperty("@copilotkit/runtime");
    expect(packageJson.dependencies).not.toHaveProperty("express");
    expect(existsSync(join(root, "utils", "runtimeUrl.ts"))).toBe(false);
  });

  it("provides browser process constants required by deepagents dependencies", () => {
    const viteConfig = readFileSync(join(process.cwd(), "vite.config.ts"), "utf8");
    expect(viteConfig).toContain("process.platform");
    expect(viteConfig).toContain("process.version");
    expect(viteConfig).toContain("process.env.NODE_ENV");
  });
});
