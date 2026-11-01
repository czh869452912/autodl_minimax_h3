import {builtinSkillCatalog,builtinSkillSnapshot} from './builtinCatalog';
test('fresh installs expose nine read-only builtin roots, content and immutable package identity',()=>{
 const items=builtinSkillCatalog();expect(items).toHaveLength(9);expect(new Set(items.map(v=>v.name)).size).toBe(9);
 for(const item of items){expect(item.description).toBeTruthy();expect(item.files['SKILL.md']).toBeTruthy();expect(item.fingerprint).toMatch(/^[a-f0-9]{64}$/);}
 expect(builtinSkillSnapshot().skills.map(v=>v.path)).toEqual(items.map(v=>v.path));
});
