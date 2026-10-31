import type {submitCreativeVideo} from './videoSubmission';
type Submission = Parameters<typeof submitCreativeVideo>[1];
export type PreparedCreativeSubmission = Omit<Submission, 'authorizationId' | 'origin' | 'planStepId'>;
type Preview = {
  draft: {id: string; revision: number; input_json: string};
  prepared: Submission['prepared'];
  versionIds: string[];
  images?: Submission['images'];
  audios?: Submission['audios'];
  sourceManifest?: Submission['sourceManifest'];
};
/** Shared entry assembly; authorization remains the caller's responsibility. */
export function preparedCreativeSubmission(preview: Preview): PreparedCreativeSubmission {
  return {
    draftId: preview.draft.id, expectedRevision: preview.draft.revision,
    draftInputJson: preview.draft.input_json, prepared: preview.prepared,
    images: preview.images ?? [], audios: preview.audios ?? [],
    versionIds: preview.versionIds,
    ...(preview.sourceManifest ? {sourceManifest: preview.sourceManifest} : {}),
  };
}
