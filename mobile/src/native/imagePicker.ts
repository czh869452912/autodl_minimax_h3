import * as ImagePicker from 'expo-image-picker';

export type NativeImageAsset = { uri: string; name: string; mimeType: string; size: number };
type GalleryResult = { canceled?: boolean; assets?: Array<{ uri: string; fileName?: string | null; mimeType?: string | null; fileSize?: number }> | null };
type GalleryLauncher = (selectionLimit: number) => Promise<GalleryResult>;

const nativeLaunch: GalleryLauncher = async (selectionLimit) => ImagePicker.launchImageLibraryAsync({
  mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit, orderedSelection: true,
});

export async function pickImagesFromGallery(remaining: number, launch: GalleryLauncher = nativeLaunch): Promise<NativeImageAsset[]> {
  if (remaining <= 0) return [];
  const result = await launch(remaining);
  if (result.canceled) return [];
  return (result.assets ?? []).slice(0, remaining).map((asset) => ({
    uri: asset.uri, name: asset.fileName ?? `image-${Date.now()}.jpg`, mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize ?? 0,
  }));
}
