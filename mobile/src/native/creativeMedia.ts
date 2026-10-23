import { NativeModules, Platform } from 'react-native';
type Publisher = {
  exportCreativeImage(source: string, key: string, mime: string, hash: string): Promise<string>;
  lookupCreativeImage(key: string, mime: string, hash: string): Promise<string | null>;
};
function native(): Publisher {
  const module = NativeModules.AutoDLMedia as Partial<Publisher> | undefined;
  if (Platform.OS !== 'android' || !module?.exportCreativeImage || !module.lookupCreativeImage) throw new Error('CREATIVE_EXPORT_UNAVAILABLE');
  return module as Publisher;
}
export const exportCreativeImage = (source: string, key: string, mime: string, hash: string) => native().exportCreativeImage(source, key, mime, hash);
export const lookupCreativeImage = (key: string, mime: string, hash: string) => native().lookupCreativeImage(key, mime, hash);
