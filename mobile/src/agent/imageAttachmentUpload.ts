import { File } from 'expo-file-system';

export type NativeImageFile = { uri: string; mimeType: string };
export type ImageDataSource = { type: 'data'; value: string; mimeType: string };

export async function readImageAsDataSource(
  file: NativeImageFile,
  createFile: (uri: string) => { base64: () => Promise<string> } = (uri) => new File(uri),
): Promise<ImageDataSource> {
  return { type: 'data', value: await createFile(file.uri).base64(), mimeType: file.mimeType };
}
