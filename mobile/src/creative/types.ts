export type CreativeProject = { id: string; title: string; brief: string; revision: number; archivedAt?: number; createdAt: number; updatedAt: number };
export type CreativeAsset = { id: string; kind: 'image' | 'video' | 'audio' | 'prompt' | 'document'; title: string; currentVersionId?: string; revision: number; createdAt: number; updatedAt: number };
export type AssetVersion = { id: string; assetId: string; versionNo: number; source: 'import' | 'generated' | 'authored'; blobSha256?: string; relativePath?: string; mime?: string; state: 'AVAILABLE' | 'MISSING' | 'PENDING'; recipe: Record<string, unknown> };
export type AsyncExecutionRef = { kind: 'generation'; jobId: string } | { kind: 'export'; deliveryId: string; operationId: string } | { kind: 'file_transfer'; attemptId: string; operationId: string };
export type CommandResult<T> = { status: 'completed'; receiptId: string; value: T } | { status: 'accepted'; receiptId: string; execution: AsyncExecutionRef };
export type CreativeCommand = import('./story').StoryCommand
  | import('./authoredText').AuthoredTextCommand
  | import('./plans').PlanCommand
  | import('./assetLifecycle').LifecycleCommand
  | import('./drafts').DraftCommand
  | { name: 'asset.export'; payload: { versionId: string; generation?: number } }
  | { name: 'project.create'; payload: { title: string; brief?: string } }
  | { name: 'project.update'; payload: { id: string; expectedRevision: number; title: string; brief: string } }
  | { name: 'project.archive'; payload: { id: string; expectedRevision: number; archived: boolean } }
  | {name:'project.setCover';payload:{id:string;expectedRevision:number;versionId:string|null}}
  | { name: 'asset.import'; payload: { title: string; kind: CreativeAsset['kind']; blobSha256: string; projectId?: string; sourceUri?: string; metadata?: Record<string,string> } }
  | { name: 'asset.setDefaultVersion'; payload: { id: string; versionId: string; expectedRevision: number } }
  | { name: 'asset.linkToProject'; payload: { assetId: string; projectId: string; versionId: string | null } }
  | { name: 'asset.unlinkFromProject'; payload: { assetId: string; projectId: string; expectedRevision: number } };
