export interface NativeMediaAttachment {
  name?: string;
  mimeType?: string;
  uri: string;
}

/** Normalize the payload emitted by Android's NativeBridge picker callback. */
export function parseNativeMediaPayload(mediaJson: string): NativeMediaAttachment | null {
  const parsed = JSON.parse(mediaJson) as Record<string, unknown>;
  const uri = [parsed.uri, parsed.url, parsed.data, parsed.dataUri]
    .find((value): value is string => typeof value === "string" && value.length > 0);

  if (!uri) return null;

  return {
    name: typeof parsed.name === "string" ? parsed.name : undefined,
    mimeType:
      typeof parsed.mimeType === "string"
        ? parsed.mimeType
        : typeof parsed.mime === "string"
          ? parsed.mime
          : undefined,
    uri,
  };
}
