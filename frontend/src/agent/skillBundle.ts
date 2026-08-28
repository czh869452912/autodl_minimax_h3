import type { FileData } from "deepagents/browser";
import { officialH3Skills as generatedSkills, officialH3SkillManifest } from "./generated/h3Skills";

export const officialH3SkillRoot = "/skills/" as const;

export { officialH3SkillManifest };

export const officialH3Skills: Record<string, FileData> = generatedSkills as Record<string, FileData>;

export function getOfficialH3SkillFiles(): Record<string, FileData> {
  return Object.fromEntries(
    Object.entries(officialH3Skills).map(([filePath, fileData]) => [
      filePath,
      {
        ...fileData,
        content: fileData.content instanceof Uint8Array ? new Uint8Array(fileData.content) : fileData.content,
      },
    ]),
  ) as Record<string, FileData>;
}
