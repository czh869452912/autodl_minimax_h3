import type { FieldSemantic } from '../schema/types';
export type FieldRenderContext = { path: string; label: string; schema: Record<string, unknown>; value: unknown; error?: string; disabled?: boolean; inputRef?: (node: import('react-native').TextInput | null) => void; onChange(value: unknown): void };
export type FieldRenderer = { semantic: FieldSemantic; render(ctx: FieldRenderContext): React.ReactNode };
