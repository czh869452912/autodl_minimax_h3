import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ALLOWED_FILES = new Set(['SKILL.md', 'SKILL.cn.md', 'README.md', 'meta.yaml', 'openai.yaml']);

function normalizeSkillPath(root: string, filePath: string) {
  const relative = path.relative(root, filePath).split(path.sep).join('/');
  return `/skills/${relative}`;
}

export async function loadOfficialSkills(root: string): Promise<Record<string, string>> {
  const resolvedRoot = path.resolve(root);
  const files: Record<string, string> = {};
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile() && (ALLOWED_FILES.has(entry.name) || entry.name.endsWith('.txt'))) {
        files[normalizeSkillPath(resolvedRoot, fullPath)] = await readFile(fullPath, 'utf8');
      }
    }
  }
  await stat(resolvedRoot);
  await visit(resolvedRoot);
  return files;
}
