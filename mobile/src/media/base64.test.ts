import {isImageBase64} from './base64';

test('multi-megabyte image data validates in bounded chunks and rejects corruption at every boundary',()=>{
  const image=Buffer.alloc(4*1024*1024,73).toString('base64');
  expect(isImageBase64(image)).toBe(true);
  for(const offset of [0,4095,4096,8192,image.length-4]) {
    expect(isImageBase64(image.slice(0,offset)+'!'+image.slice(offset+1))).toBe(false);
  }
});
test.each(['','A','AAAA=','A===','====','AA=A','AA\nA','AA A','AA-_'])('rejects malformed image base64: %p',value=>{
  expect(isImageBase64(value)).toBe(false);
});
test.each(['AAAA','AAA=','AA=='])('accepts standard padding: %s',value=>{
  expect(isImageBase64(value)).toBe(true);
});
