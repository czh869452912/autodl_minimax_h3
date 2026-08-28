import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { officialH3Skills, officialH3SkillManifest } from "./skillBundle";

function filesUnder(root: string, prefix = ""): string[] {
  return readdirSync(root).flatMap((name) => {
    const filePath = join(root, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    return statSync(filePath).isDirectory() ? filesUnder(filePath, relative) : [relative];
  });
}

describe("official H3 skill bundle", () => {
  it("contains every source file with unchanged bytes", () => {
    const sourceRoot = join(process.cwd(), "src", "agent", "skills", "minimax-h3");
    const sourceFiles = filesUnder(sourceRoot).sort();
    expect(Object.keys(officialH3Skills).sort()).toEqual(sourceFiles.map((file) => `/skills/${file}`));

    for (const sourceFile of sourceFiles) {
      const bytes = readFileSync(join(sourceRoot, sourceFile));
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(officialH3SkillManifest[`/skills/${sourceFile}`]).toBe(digest);
    }
  });
});
