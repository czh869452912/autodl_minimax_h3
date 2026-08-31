export type ArtifactKind = 'image' | 'video' | 'audio' | 'text' | 'file' | 'json';
export type FieldSemantic = 'prompt' | 'negativePrompt' | 'image' | 'image[]' | 'audio' | 'audio[]' | 'video' | 'text' | 'number' | 'integer' | 'boolean' | 'enum' | 'seed';
export type WorkflowWidget = 'text' | 'textarea' | 'segmented' | 'select' | 'stepper' | 'toggle' | 'number' | 'seed' | 'asset' | 'asset-list';
export type JsonSchemaSubset = Record<string, unknown>;
export type WorkflowUiSchema = { sections: Array<{ id: string; title: string; fields: string[] }> };
export type RequestMapping = { operation: string; bindings: Record<string, string> };
export type OutputMapping = { artifacts: Array<{ kind: ArtifactKind; from: string }> };
export type Compatibility = { minAppVersion?: string; requiredAdapterVersion?: string; artifactKinds?: ArtifactKind[] };
export type PlatformAdapterManifest = { id: string; adapterVersion: string; platforms: string[]; capabilities: string[]; credentialKinds: string[]; operations: string[]; supportedArtifactKinds: ArtifactKind[] };
export type WorkflowDefinition = {
  schemaVersion: '1.0'; id: string; version: string; kind: 'atomic' | 'composite';
  platform: { adapter: string; operation: string; workflowId?: string };
  metadata: { title: string; category: 'image' | 'video' | 'audio' | 'text' | 'other'; description?: string; icon?: string; tags?: string[] };
  inputs: JsonSchemaSubset; ui?: WorkflowUiSchema; request: RequestMapping; outputs: OutputMapping;
  compatibility?: Compatibility; steps?: unknown[]; bindings?: unknown[];
};
export type WorkflowDraft = { workflowId: string; workflowVersion: string; contentHash: string; inputs: Record<string, unknown>; source: 'user' | 'import'; status: 'incomplete' | 'ready' };
export type ValidationError = { path: string; code: string; message: string };
export type ValidationResult = { ok: true; value: WorkflowDefinition } | { ok: false; errors: ValidationError[] };
