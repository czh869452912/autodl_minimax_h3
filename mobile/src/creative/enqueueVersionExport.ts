import CryptoJS from 'crypto-js';
import type {AppDatabase} from '../storage/appDatabase';
import {insertWorkflowOperation} from '../workflows/executor/operationInsert';
import {CREATIVE_FILE_MIMES,creativeExportTarget} from './fileFormats';
import {createId} from '../ids';
// Must run inside the caller's write transaction; generation 1 is shared by automatic and manual saves.
export async function enqueueVersionExport(tx:AppDatabase,versionId:string,generation:number,now:number,id:()=>string=createId){
            const existing = await tx.getFirstAsync<{ id: string; operation_id: string }>("SELECT id,operation_id FROM creative_deliveries WHERE version_id=? AND file_role='original' AND generation=?", versionId, generation);
            if (existing) return { kind: 'export' as const, deliveryId: existing.id, operationId: existing.operation_id };
            const file = await tx.getFirstAsync<{ blob_sha256: string; mime: string }>("SELECT f.blob_sha256,b.mime FROM creative_version_files f JOIN artifact_blobs b ON b.sha256=f.blob_sha256 WHERE f.version_id=? AND f.role='original' AND f.state='AVAILABLE'", versionId);
            if (!file) throw new Error('VERSION_NOT_AVAILABLE');
            if (!(CREATIVE_FILE_MIMES as readonly string[]).includes(file.mime)) throw new Error('EXPORT_MIME_UNSUPPORTED');
            const epoch = await tx.getFirstAsync<{ epoch: string }>('SELECT epoch FROM creative_execution_state WHERE id=1');
            if (!epoch) throw new Error('EXECUTION_EPOCH_MISSING');
            const deliveryId = id(), operationId = id();
            const publicationKey = CryptoJS.SHA256(deliveryId).toString();
            await insertWorkflowOperation(tx, { id: operationId, kind: 'EXPORT', idempotencyKey: deliveryId, payload: { kind: 'creative_version', deliveryId }, now }, 'error');
            await tx.runAsync("INSERT INTO creative_deliveries VALUES(?,?,'original',?,?,'QUEUED',?,?,?,NULL,NULL,?,?)", deliveryId, versionId, creativeExportTarget(file.mime),generation, operationId, publicationKey, epoch.epoch, now, now);
            await tx.runAsync("INSERT INTO artifact_blob_refs VALUES(?,'creative_delivery',?,?)", file.blob_sha256, deliveryId, now);
            await tx.runAsync('UPDATE executor_wake_state SET generation=generation+1,requested_at=? WHERE singleton=1', now);
            return { kind: 'export' as const, deliveryId, operationId };
}
