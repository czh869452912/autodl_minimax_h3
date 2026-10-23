export const CREATIVE_FILE_MIMES=['image/png','image/jpeg','image/webp','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/wav','audio/ogg','text/plain','text/markdown','application/json','application/pdf'] as const;
export function creativeFileKind(mime:string):'image'|'video'|'audio'|'document'{
  if(!(CREATIVE_FILE_MIMES as readonly string[]).includes(mime))throw new Error('不支持该文件格式');
  return mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'document';
}
export const creativeExportTarget=(mime:string)=>mime.startsWith('image/')||mime.startsWith('video/')?'system-gallery':'system-downloads';
