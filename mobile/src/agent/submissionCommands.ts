import type { Message } from '@ag-ui/client';
import { createId } from '../ids';
export type SubmissionCommand = { id: string; message: Message; runId: string; draftRevision: number; retryOf?: string };
export type SubmissionReceipt = { submissionId: string; userMessageId: string; runId: string; executionReady?: boolean };
export const createAgentId = createId;
