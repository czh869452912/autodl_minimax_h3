import type { Message } from '@ag-ui/client';
import CryptoJS from 'crypto-js';
export type SubmissionCommand = { id: string; message: Message; runId: string; draftRevision: number; retryOf?: string };
export type SubmissionReceipt = { submissionId: string; userMessageId: string; runId: string; executionReady?: boolean };
export const createAgentId = () => CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
