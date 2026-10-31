import { zipSync, strToU8 } from 'fflate';
import { readSkillZip, validateSkillPackage } from './package';
const text = '---\nname: scene-review\ndescription: Review a scene\n---\nRead [details](references/details.md).';
const files = { 'SKILL.md': text, 'references/details.md': 'Use the exact shot version.' };

test('imports equivalent single-folder ZIP and text package without changing source content', () => {
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([path, value]) => [`scene/${path}`, strToU8(value)])));
  expect(readSkillZip(zip)).toEqual(validateSkillPackage(files));
  expect(validateSkillPackage({ ...files, 'SKILL.md': text.replace(/\n/g, '\r\n') }).id).toBe(validateSkillPackage(files).id);
});
test.each(['../escape.md', '/absolute.md', 'refs\\escape.md', 'file:stream.md', 'scripts/tool.js'])('rejects unsafe or executable entries: %s', path => {
  expect(() => readSkillZip(zipSync({ 'SKILL.md': strToU8(text), [path]: strToU8('data') }))).toThrow();
});
test('rejects missing references, duplicate skill roots and declared executable dependencies', () => {
  expect(() => validateSkillPackage({ 'SKILL.md': text })).toThrow(/缺失/);
  expect(() => validateSkillPackage({ ...files, 'other/SKILL.md': text })).toThrow(/单技能/);
  expect(() => validateSkillPackage({ ...files, 'SKILL.md': text.replace('description:', 'requires: python\ndescription:') })).toThrow(/依赖/);
  expect(() => validateSkillPackage({ ...files, 'references/Details.md': 'shadow' })).toThrow(/重复/);
});
test('rejects size bombs, CRC tampering, symlinks and central/local disagreement', () => {
  const archive = () => zipSync(Object.fromEntries(Object.entries(files).map(([path, value]) => [path, strToU8(value)])), { level: 0 });
  const badCrc = archive(); badCrc[30 + 'SKILL.md'.length + 10] ^= 1;
  expect(() => readSkillZip(badCrc)).toThrow(/校验/);
  const badName = archive(); badName[30] = 88;
  expect(() => readSkillZip(badName)).toThrow(/路径/);
  const link = archive(), view = new DataView(link.buffer);
  const central = view.getUint32(link.length - 6, true);
  view.setUint32(central + 38, 0xa1ff0000, true);
  expect(() => readSkillZip(link)).toThrow(/符号链接/);
  const bomb = zipSync({ 'SKILL.md': strToU8('x'.repeat(1024 * 1024)) });
  expect(() => readSkillZip(bomb)).toThrow(/512/);
  const forged = new DataView(bomb.buffer), dir = forged.getUint32(bomb.length - 6, true);
  forged.setUint32(dir + 24, 100, true);
  expect(() => readSkillZip(bomb)).toThrow(/声明大小/);
});

test('capability metadata is declarative, versioned and cannot introduce execution rights',()=>{
 const body='---\nname: review\ndescription: review\nworkbench-capabilities:\n  version: 1\n  tools: [shot_get]\n  inputs: [text]\n  output: quality-report\n---\nRead facts.';
 expect(validateSkillPackage({'SKILL.md':body}).capabilities).toEqual({version:1,tools:['shot_get'],inputs:['text'],output:'quality-report'});
 expect(()=>validateSkillPackage({'SKILL.md':body.replace('version: 1','version: 2')})).toThrow();
 expect(()=>validateSkillPackage({'SKILL.md':body.replace('output: quality-report','output: quality-report\n  grant: true')})).toThrow();
});
