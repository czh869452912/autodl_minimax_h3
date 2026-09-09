import type { AppDatabase } from '../storage/appDatabase';
import * as FileSystem from 'expo-file-system/legacy';
import CryptoJS from 'crypto-js';
import { createArtifactCas, type ArtifactCasBlob } from './cas';
import { sha256File } from '../native/media';
import { withAsyncSchedulerLease } from '../tasks/scheduler';
import { withWriteTransaction } from '../storage/sqliteBusy';
import { assertAppDatabaseWritableAsync } from '../storage/database';
import { getDatabase } from '../storage/databaseClient';

const IMAGE_BYTES = 20 * 1024 * 1024;
const newOwnerId = () => CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
export async function releaseExpiredAttachmentImports(db: AppDatabase, now = Date.now()): Promise<void> {
  await assertAppDatabaseWritableAsync(db);
  await withWriteTransaction(db, async tx => {
    await tx.runAsync("DELETE FROM artifact_blob_refs WHERE owner_type='agent_import' AND NOT EXISTS (SELECT 1 FROM app_scheduler_leases l WHERE l.lease_key='agent-import:'||artifact_blob_refs.owner_id AND l.expires_at>?)", now);
    await tx.runAsync("DELETE FROM app_scheduler_leases WHERE lease_key LIKE 'agent-import:%' AND expires_at<=?", now);
  });
}
export function validateImageBudget(images: readonly { size?: number }[]): void {
  if (images.length > 9) throw new Error('参考图片最多 9 张');
  if (images.some(image => !Number.isFinite(image.size) || image.size! <= 0)) throw new Error('无法确认图片大小，请重新选择');
  if (images.some(image => image.size! > IMAGE_BYTES)) throw new Error('单张图片不能超过 20MB');
  if (images.reduce((total, image) => total + image.size!, 0) > 50 * 1024 * 1024) throw new Error('参考图片总计不能超过 50MB');
}
const blobPath = (hash: string) => `cas/sha256/${hash.slice(0, 2)}/${hash}`;
const resolveUri = (relative: string) => `${FileSystem.documentDirectory ?? ''}${relative}`;
function hashOf(uri: string): string | undefined {
  const asset = /^asset:\/\/([a-f0-9]{64})$/.exec(uri)?.[1];
  const local = /\/cas\/sha256\/[a-f0-9]{2}\/([a-f0-9]{64})$/.exec(uri)?.[1];
  return asset ?? (local && uri === resolveUri(blobPath(local)) ? local : undefined);
}
export function attachmentHashes(input: unknown): string[] {
  const hashes = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === 'string') { const hash = hashOf(value); if (hash) hashes.add(hash); }
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(input);
  return [...hashes];
}
function dataUri(source: string, mime = 'image/png') { return source.startsWith('data:') ? source : `data:${mime};base64,${source}`; }

async function importImage(uri: string, mimeHint?: string): Promise<ArtifactCasBlob> {
  const operationId = newOwnerId();
  const name = CryptoJS.SHA256(`${operationId}\u00000`).toString(CryptoJS.enc.Hex);
  const partUri = resolveUri(`cas/parts/${name}.part`);
  await FileSystem.makeDirectoryAsync(resolveUri('cas/parts'), { intermediates: true });
  let mime = mimeHint ?? '';
  try {
    if (uri.startsWith('data:')) {
      const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(uri);
      if (!match || match[2].length % 4 || match[2].length > Math.ceil(IMAGE_BYTES / 3) * 4) throw new Error('图片编码无效或超过 20MB');
      mime = match[1].toLowerCase();
      await FileSystem.writeAsStringAsync(partUri, match[2], { encoding: FileSystem.EncodingType.Base64 });
    } else {
      if (!/^(file|content):\/\//.test(uri)) throw new Error('参考图片必须已保存在本地');
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || info.isDirectory || info.size <= 0 || info.size > IMAGE_BYTES) throw new Error('图片已失效或超过 20MB');
      await FileSystem.copyAsync({ from: uri, to: partUri });
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif'].includes(mime)) throw new Error('无法确认图片类型，请重新选择');
    const info = await FileSystem.getInfoAsync(partUri);
    if (!info.exists || info.isDirectory) throw new Error('图片写入失败');
    const hash = await sha256File(partUri);
    const staged = await createArtifactCas().adoptNativePart({ partUri, mime, byteSize: info.size, sha256: hash }, { operationId, operationAttempt: 0, mime, maxBytes: IMAGE_BYTES });
    return await staged.publish();
  } catch (error) { await FileSystem.deleteAsync(partUri, { idempotent: true }).catch(() => undefined); throw error; }
}

async function importText(content: string): Promise<ArtifactCasBlob> {
  const bytes = CryptoJS.enc.Utf8.parse(content).sigBytes;
  if (bytes > 1024 * 1024) throw new Error('工作区文件超过大小限制');
  const operationId = newOwnerId();
  const partUri = resolveUri(`cas/parts/${CryptoJS.SHA256(`${operationId}\u00000`).toString()}.part`);
  await FileSystem.makeDirectoryAsync(resolveUri('cas/parts'), { intermediates: true });
  try {
    await FileSystem.writeAsStringAsync(partUri, content, { encoding: FileSystem.EncodingType.UTF8 });
    const hash = await sha256File(partUri);
    const staged = await createArtifactCas().adoptNativePart({ partUri, mime: 'text/plain', byteSize: bytes, sha256: hash }, { operationId, operationAttempt: 0, mime: 'text/plain', maxBytes: 1024 * 1024 });
    return await staged.publish();
  } catch (error) { await FileSystem.deleteAsync(partUri, { idempotent: true }).catch(() => undefined); throw error; }
}

export function createAttachmentStore(db: AppDatabase, deps: { importImage?: typeof importImage; importText?: typeof importText; readText?: (uri: string) => Promise<string>; resolveUri?: typeof resolveUri } = {}) {
  const importer = deps.importImage ?? importImage;
  const uriFor = deps.resolveUri ?? resolveUri;
  const imported = new Map<string, ArtifactCasBlob>();
  return {
    async externalize<T>(input: T): Promise<{ value: T; hashes: string[]; releaseStaging: () => Promise<void> }> {
      const owner = newOwnerId();
      const leaseKey = `agent-import:${owner}`;
      await assertAppDatabaseWritableAsync(db);
      await db.runAsync('INSERT INTO app_scheduler_leases(lease_key,owner,expires_at) VALUES(?,?,?)', leaseKey, owner, Date.now() + 120000);
      let renewal: Promise<unknown> | undefined;
      const heartbeat = setInterval(() => {
        if (!renewal) renewal = db.runAsync('UPDATE app_scheduler_leases SET expires_at=? WHERE lease_key=? AND owner=?', Date.now() + 120000, leaseKey, owner).catch(() => undefined).finally(() => { renewal = undefined; });
      }, 40000);
      const known = new Map<string, string>();
      const hashes = new Set<string>();
      const storeImage = async (source: string, mime?: string, text = false): Promise<string> => {
        const existingHash = text ? undefined : hashOf(source);
        if (existingHash) {
          await withWriteTransaction(db, async tx => {
            const exists = await tx.getFirstAsync('SELECT sha256 FROM artifact_blobs WHERE sha256=?', existingHash);
            if (!exists) throw new Error('参考素材记录缺失，请重新添加');
            await tx.runAsync('INSERT OR IGNORE INTO artifact_blob_refs VALUES(?,?,?,?)', existingHash, 'agent_import', owner, Date.now());
          });
          hashes.add(existingHash); return `asset://${existingHash}`;
        }
        const cacheKey = text ? `text:${source}` : source;
        if (known.has(cacheKey)) return known.get(cacheKey)!;
        const importKey = text || source.startsWith('data:') ? CryptoJS.SHA256(cacheKey).toString() : undefined;
        const cached = importKey ? imported.get(importKey) : undefined;
        if (cached) {
          const retained = await withWriteTransaction(db, async tx => {
            if (!await tx.getFirstAsync('SELECT sha256 FROM artifact_blobs WHERE sha256=?', cached.sha256)) return false;
            await tx.runAsync('INSERT OR IGNORE INTO artifact_blob_refs VALUES(?,?,?,?)', cached.sha256, 'agent_import', owner, Date.now());
            return true;
          });
          if (retained) { hashes.add(cached.sha256); return `asset://${cached.sha256}`; }
        }
        // Share the collector lease until the staging owner is durable.
        const deadline = Date.now() + 5000;
        let blob: ArtifactCasBlob | undefined;
        while (!blob) {
          blob = await withAsyncSchedulerLease('cas-gc', async lease => {
            await assertAppDatabaseWritableAsync(db);
            const result = await (text ? (deps.importText ?? importText)(source) : importer(source, mime));
            await lease.assertOwned();
            await withWriteTransaction(db, async tx => {
              await tx.runAsync('INSERT INTO artifact_blobs(sha256,byte_size,mime,relative_path,created_at,verified_at) VALUES(?,?,?,?,?,?) ON CONFLICT(sha256) DO UPDATE SET verified_at=excluded.verified_at', result.sha256, result.byteSize, result.mime, result.relativePath, Date.now(), Date.now());
              await tx.runAsync('INSERT OR IGNORE INTO artifact_blob_refs VALUES(?,?,?,?)', result.sha256, 'agent_import', owner, Date.now());
            });
            return result;
          }, { db, ttlMs: 120000 });
          if (!blob) { if (Date.now() >= deadline) throw new Error('素材正在维护，请重试'); await new Promise(resolve => setTimeout(resolve, 50)); }
        }
        const value = `asset://${blob.sha256}`;
        if (importKey) imported.set(importKey, blob);
        if (imported.size > 128) imported.delete(imported.keys().next().value!);
        hashes.add(blob.sha256); known.set(cacheKey, value);
        return value;
      };
      const visit = async (value: any, key?: string): Promise<any> => {
        if (typeof value === 'string') {
          if (hashOf(value)) return storeImage(value);
          if ((key === 'uri' || key === 'url') && value.startsWith('data:image/')) return storeImage(value);
          return value;
        }
        if (!value || typeof value !== 'object') return value;
        if (Array.isArray(value)) { const result = []; for (const item of value) result.push(await visit(item)); return result; }
        const traceKeys = value.kind === 'reasoning' && typeof value.messageId === 'string' ? ['text']
          : typeof value.startedAt === 'number' && typeof value.name === 'string' && typeof value.id === 'string' ? ['arguments', 'output'] : [];
        if (traceKeys.some(field => typeof value[field] === 'string' && value[field].length > 4096)) {
          const result = { ...value };
          const traceTextAssets: Record<string, string[]> = {};
          for (const field of traceKeys) {
            const text = value[field];
            if (typeof text !== 'string' || text.length <= 4096) continue;
            const parts: string[] = [];
            for (let offset = 0; offset < text.length;) {
              let end = Math.min(text.length, offset + 65536);
              // Keep UTF-16 surrogate pairs intact before UTF-8 encoding.
              if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
              parts.push(await storeImage(text.slice(offset, end), 'text/plain', true));
              offset = end;
            }
            traceTextAssets[field] = parts;
            delete result[field];
          }
          return { ...result, traceTextAssets };
        }
        if (value.schemaVersion === 1 && typeof value.graphVersion === 'string' && value.files && typeof value.files === 'object') {
          const files: Record<string, unknown> = {};
          for (const [path, raw] of Object.entries(value.files)) {
            const { content, ...metadata } = raw as Record<string, any>;
            files[path] = typeof content === 'string' && content.length ? { ...metadata, contentAsset: await storeImage(content, 'text/plain', true) } : await visit(raw);
          }
          return { ...value, files };
        }
        if (value.type === 'data' && typeof value.value === 'string' && value.mimeType?.startsWith('image/')) return { ...value, type: 'url', value: await storeImage(dataUri(value.value, value.mimeType), value.mimeType) };
        if (value.type === 'url' && typeof value.value === 'string' && /^(file|content):\/\//.test(value.value)) return { ...value, value: await storeImage(value.value, value.mimeType) };
        if (typeof value.uri === 'string' && /^(file|content):\/\//.test(value.uri)) {
          const extension = String(value.filename ?? value.name ?? value.uri).split('.').pop()?.toLowerCase();
          const mime = value.mime ?? value.mimeType ?? ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif' } as Record<string, string>)[extension ?? ''];
          if (hashOf(value.uri) || mime?.startsWith('image/')) return { ...value, uri: await storeImage(value.uri, mime) };
        }
        const result: Record<string, unknown> = {};
        for (const [name, item] of Object.entries(value)) result[name] = await visit(item, name);
        return result;
      };
      const releaseStaging = async () => {
        clearInterval(heartbeat);
        if (renewal) await renewal;
        await withWriteTransaction(db, async tx => {
          await tx.runAsync("DELETE FROM artifact_blob_refs WHERE owner_type='agent_import' AND owner_id=?", owner);
          await tx.runAsync('DELETE FROM app_scheduler_leases WHERE lease_key=? AND owner=?', leaseKey, owner);
        });
      };
      try { return { value: await visit(input), hashes: [...hashes], releaseStaging }; }
      catch (error) { await releaseStaging().catch(() => undefined); throw error; }
    },
    async hydrate<T>(input: T): Promise<T> {
      const contents = new Map<string, Promise<string>>();
      const visit = async (value: any): Promise<any> => {
        if (typeof value === 'string') { const hash = /^asset:\/\/([a-f0-9]{64})$/.exec(value)?.[1]; return hash ? uriFor(blobPath(hash)) : value; }
        if (Array.isArray(value)) return Promise.all(value.map(visit));
        if (value && typeof value === 'object') {
          if (value.traceTextAssets && typeof value.traceTextAssets === 'object') {
            const { traceTextAssets, ...rest } = value;
            const result = await visit(rest);
            for (const [field, assets] of Object.entries(traceTextAssets)) {
              if (!['text', 'arguments', 'output'].includes(field) || !Array.isArray(assets) || assets.some(asset => typeof asset !== 'string' || !hashOf(asset))) throw new Error('执行记录文本引用无效');
              const chunks: string[] = [];
              for (const asset of assets) chunks.push((await visit({ contentAsset: asset })).content);
              result[field] = chunks.join('');
            }
            return result;
          }
          if (typeof value.contentAsset === 'string' && hashOf(value.contentAsset)) {
            const hash = hashOf(value.contentAsset)!;
            if (!contents.has(hash)) contents.set(hash, (async () => {
              const blob = await db.getFirstAsync<{ mime: string; byte_size: number }>('SELECT mime,byte_size FROM artifact_blobs WHERE sha256=?', hash);
              if (!blob || blob.mime !== 'text/plain' || blob.byte_size <= 0 || blob.byte_size > 1024 * 1024) throw new Error('工作区文件记录无效或超过大小限制');
              const content = await (deps.readText ?? (uri => FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 })))(uriFor(blobPath(hash)));
              if (CryptoJS.enc.Utf8.parse(content).sigBytes !== blob.byte_size) throw new Error('工作区文件大小与记录不一致');
              return content;
            })());
            const { contentAsset: _ref, ...rest } = value;
            return { ...rest, content: await contents.get(hash) };
          }
          return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await visit(item)])));
        }
        return value;
      };
      return visit(input);
    },
    async retain(tx: AppDatabase, ownerType: string, ownerId: string, hashes: readonly string[]) {
      for (const hash of hashes) {
        const exists = await tx.getFirstAsync('SELECT sha256 FROM artifact_blobs WHERE sha256=?', hash);
        if (!exists) throw new Error('参考素材记录缺失，请重新添加');
        await tx.runAsync('INSERT OR IGNORE INTO artifact_blob_refs VALUES(?,?,?,?)', hash, ownerType, ownerId, Date.now());
      }
    },
    async release(tx: AppDatabase, ownerType: string, ownerId: string) { await tx.runAsync('DELETE FROM artifact_blob_refs WHERE owner_type=? AND owner_id=?', ownerType, ownerId); },
  };
}

export async function hydrateModelImages(messages: unknown[]): Promise<unknown[]> {
  const visit = async (value: any): Promise<any> => {
    if (Array.isArray(value)) { const result = []; for (const item of value) result.push(await visit(item)); return result; }
    if (!value || typeof value !== 'object') return value;
    if (value.type === 'image_url' && /^(file|content):\/\//.test(value.image_url?.url ?? '')) {
      const uri = value.image_url.url;
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || info.isDirectory || info.size > IMAGE_BYTES) throw new Error('参考图片已失效或过大，请重新添加');
      const encoded = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const hash = hashOf(uri);
      const metadata = hash ? await getDatabase().getFirstAsync<{ mime: string }>('SELECT mime FROM artifact_blobs WHERE sha256=?', hash) : null;
      if (!metadata?.mime.startsWith('image/')) throw new Error('图片缺少已验证的素材记录');
      return { ...value, image_url: { ...value.image_url, url: dataUri(encoded, metadata.mime) } };
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = await visit(item);
    return result;
  };
  return visit(messages);
}
