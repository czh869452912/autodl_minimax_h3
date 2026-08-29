import type { FileData } from 'deepagents/browser';
import { officialH3Skills as generatedSkills, officialH3SkillManifest } from './generated/h3Skills';

export const officialH3SkillRoot = '/skills/' as const;
export { officialH3SkillManifest };

export const officialH3Skills: Record<string, FileData> = generatedSkills as Record<string, FileData>;

// yaml 2.9's Hermes build rejects a few otherwise-valid Unicode flow arrays
// in the official frontmatter. Preserve every trigger verbatim, but express
// the sequence in block form before DeepAgents discovers the bundled skills.
function normalizeSkillFrontmatter(content: string): string {
  return content.replace(/^(\s*)trigger-words:\s*(\[[^\r\n]*\])\s*$/m, (_line, indentation: string, encoded: string) => {
    try {
      const triggers = JSON.parse(encoded) as string[];
      return `${indentation}trigger-words:\n${triggers.map((trigger) => `${indentation}  - ${JSON.stringify(trigger)}`).join('\n')}`;
    } catch {
      return _line;
    }
  });
}

export function getOfficialH3SkillFiles(): Record<string, FileData> {
  return Object.fromEntries(
    Object.entries(officialH3Skills).map(([path, file]) => [
      path,
      {
        ...file,
        content: file.content instanceof Uint8Array ? new Uint8Array(file.content) : normalizeSkillFrontmatter(String(file.content)),
      },
    ]),
  ) as Record<string, FileData>;
}
