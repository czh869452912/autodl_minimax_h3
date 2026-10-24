import {ImageDraftScreen} from './ImageDraftScreen';
export function CreativeImageDraftRouter({id}:{id:string}){
  return <ImageDraftScreen key={id} id={id} />;
}
