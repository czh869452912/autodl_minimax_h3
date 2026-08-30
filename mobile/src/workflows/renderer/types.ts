import type { FieldSemantic } from '../schema/types';
export type FieldRenderContext = { path: string; label: string; schema: Record<string, unknown>; value: unknown; error?: string; onChange(value: unknown): void };
export type FieldRenderer = { semantic: FieldSemantic; render(ctx: FieldRenderContext): React.ReactNode };
