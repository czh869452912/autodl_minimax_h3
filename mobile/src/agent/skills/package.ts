import CryptoJS from 'crypto-js';
import { Inflate, strFromU8, strToU8 } from 'fflate';
import { load, JSON_SCHEMA } from 'js-yaml';

export const SKILL_BYTES = 512 * 1024;
export const SKILL_FILES = 32;
export type SkillPackage = { id: string; name: string; description: string; files: Record<string, string> };
const fail = (message: string): never => { throw new Error(message); };

function pathName(path: string): string {
  if (path.length > 200 || !/^[A-Za-z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..')) fail('技能文件路径不安全');
  return path;
}

/** Text-only packages never materialize paths or execute their contents. */
export function validateSkillPackage(input: Record<string, string>): SkillPackage {
  const keys = Object.keys(input);
  if (!keys.length || keys.length > SKILL_FILES) fail('技能包最多包含 32 个文本文件');
  let bytes = 0;
  const seen = new Set<string>();
  const files: Record<string, string> = {};
  for (const path of keys.sort()) {
    pathName(path);
    if (seen.has(path.toLowerCase())) fail('技能文件名重复');
    seen.add(path.toLowerCase());
    if (!/\.(md|txt|json)$/i.test(path)) fail('此版本只支持文本技能；脚本、程序及二进制资源不能安装');
    const text = input[path];
    if (typeof text !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(text)) fail('技能文件必须是有效 UTF-8 文本');
    bytes += strToU8(text).length;
    if (bytes > SKILL_BYTES) fail('技能文本总量不能超过 512 KiB');
    files[path] = text.replace(/\r\n/g, '\n');
  }
  if (!files['SKILL.md'] || Object.keys(files).filter(path => /(^|\/)SKILL\.md$/i.test(path)).length !== 1) fail('请选择根目录包含一个 SKILL.md 的单技能包');
  const front = files['SKILL.md'].match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!front) fail('SKILL.md 需要 YAML 头部中的 name 和 description');
  const meta = load(front![1], { schema: JSON_SCHEMA }) as Record<string, unknown>;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || typeof meta.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.name) || meta.name.length > 64 || typeof meta.description !== 'string' || !meta.description.trim() || meta.description.length > 1000) fail('技能 name 必须为小写英文短名，description 不能为空');
  if (['dependencies', 'requires', 'allowed-tools'].some(key => meta[key] != null)) fail('此技能声明了额外依赖或工具权限，请先改为纯文本指导版本');
  // Validate local Markdown references before publication. Remote links stay text.
  for (const [path, text] of Object.entries(files)) {
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)) {
      const target = match[1].replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^https?:\/\//i.test(target)) continue;
      const resolved = [...path.split('/').slice(0, -1), ...target.split('/')];
      const normalized: string[] = [];
      for (const part of resolved) {
        if (part === '..') { if (!normalized.length) fail('技能引用越过包根目录'); normalized.pop(); }
        else if (part !== '.') normalized.push(part);
      }
      const destination = pathName(normalized.join('/'));
      if (!(destination in files)) fail(`技能引用的文件缺失：${destination}`);
    }
  }
  return { id: CryptoJS.SHA256(JSON.stringify(files)).toString(), name: meta.name as string, description: (meta.description as string).trim(), files };
}

function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ -1) >>> 0;
}

/** Bounded ZIP reader: checks the central directory, then inflates small chunks. */
export function readSkillZip(bytes: Uint8Array): SkillPackage {
  if (bytes.length > SKILL_BYTES || bytes.length < 22) fail('ZIP 大小无效，最大 512 KiB');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (p: number) => view.getUint16(p, true), u32 = (p: number) => view.getUint32(p, true);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && u32(end) !== 0x06054b50) end--;
  if (end < 0 || u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length) fail('ZIP 目录损坏');
  const count = u16(end + 10), directorySize = u32(end + 12), directory = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || count !== u16(end + 8) || count > 64 || directory + directorySize !== end) fail('不支持分卷、ZIP64 或超量文件包');
  const files: Record<string, string> = {};
  const names = new Set<string>();
  let cursor = directory, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) fail('ZIP 条目损坏');
    const flags = u16(cursor + 8), method = u16(cursor + 10), crc = u32(cursor + 16);
    const packed = u32(cursor + 20), size = u32(cursor + 24), nameSize = u16(cursor + 28);
    const next = cursor + 46 + nameSize + u16(cursor + 30) + u16(cursor + 32);
    if (next > end || flags & 1 || (method !== 0 && method !== 8) || (u32(cursor + 38) >>> 16 & 0xf000) === 0xa000) fail('ZIP 包含加密文件、符号链接或不支持的压缩方式');
    const name = strFromU8(bytes.subarray(cursor + 46, cursor + 46 + nameSize));
    pathName(name.endsWith('/') ? name.slice(0, -1) : name);
    if (names.has(name.toLowerCase())) fail('ZIP 文件名重复');
    names.add(name.toLowerCase());
    total += size;
    if (total > SKILL_BYTES || packed > SKILL_BYTES) fail('ZIP 解压后超过 512 KiB');
    const local = u32(cursor + 42);
    if (local + 30 > directory || u32(local) !== 0x04034b50 || u16(local + 8) !== method || u16(local + 6) !== flags) fail('ZIP 本地条目与目录不一致');
    const dataStart = local + 30 + u16(local + 26) + u16(local + 28);
    if (dataStart + packed > directory || strFromU8(bytes.subarray(local + 30, local + 30 + u16(local + 26))) !== name) fail('ZIP 本地路径或数据损坏');
    const parts: Uint8Array[] = [];
    let produced = 0;
    const collect = (chunk: Uint8Array) => { produced += chunk.length; if (produced > size) fail('ZIP 实际内容超过声明大小'); parts.push(chunk.slice()); };
    const data = bytes.subarray(dataStart, dataStart + packed);
    if (method === 0) collect(data);
    else {
      const inflater = new Inflate(collect);
      for (let offset = 0; offset < packed; offset += 128) inflater.push(data.subarray(offset, offset + 128), offset + 128 >= packed);
    }
    if (produced !== size) fail('ZIP 文件大小不匹配');
    const output = new Uint8Array(produced); let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    if (crc32(output) !== crc) fail('ZIP 文件校验失败');
    if (!name.endsWith('/')) files[name] = strFromU8(output);
    cursor = next;
  }
  if (cursor !== end) fail('ZIP 目录条数不匹配');
  const roots = Object.keys(files).filter(path => /(^|\/)SKILL\.md$/.test(path));
  if (roots.length === 1 && roots[0] !== 'SKILL.md') {
    const prefix = roots[0].slice(0, -'SKILL.md'.length);
    if (Object.keys(files).every(path => path.startsWith(prefix))) return validateSkillPackage(Object.fromEntries(Object.entries(files).map(([path, text]) => [path.slice(prefix.length), text])));
  }
  return validateSkillPackage(files);
}
