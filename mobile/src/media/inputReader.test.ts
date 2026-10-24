import {createInitializedRealSqliteTestDb} from '../test/realSqlite';
import {createInputReader} from './inputReader';
import {createAutodlComfyUiAdapter} from '../workflows/providers/autodl/adapter';
import {classifyProviderFailure} from '../workflows/executor/errorPolicy';

test('AutoDL resolves image and audio asset references into verified local bytes before HTTP dispatch',async()=>{
  const db=createInitializedRealSqliteTestDb(),hash='a'.repeat(64),read=jest.fn(async()=> 'Ynl0ZXM='),verify=jest.fn(async()=>hash);
  const transport=jest.fn(async(_url:any,_init?:any)=>new Response(JSON.stringify({code:'Success',data:{task_id:'remote-task'}}),{status:200}));
  try{
    db.runSync('INSERT INTO artifact_blobs VALUES(?,5,?,?,1,1)',hash,'image/png',`cas/sha256/aa/${hash}`);
    const reader=createInputReader(db as never,{read,hash:verify,root:'file:///app/'});
    expect(await reader(`asset://${hash}`)).toBe('Ynl0ZXM=');
    expect(read).toHaveBeenCalledWith(`file:///app/cas/sha256/aa/${hash}`);
    const adapter=createAutodlComfyUiAdapter({token:'test-only',transport:transport as never,readBase64:reader});
    const input=await adapter.prepareInput({images:[{uri:`asset://${hash}`,mime:'image/png',size:5}],audios:[{uri:`asset://${hash}`,mime:'audio/wav',size:5}]} as never);
    expect(input.images?.[0].dataUri).toBe('data:image/png;base64,Ynl0ZXM=');
    expect(input.audios?.[0].dataUri).toBe('data:audio/wav;base64,Ynl0ZXM=');
    expect(transport).not.toHaveBeenCalled();
    await expect(adapter.submit(input)).resolves.toEqual({providerJobId:'remote-task'});
    expect(JSON.parse(transport.mock.calls[0][1].body)).toMatchObject({ref_image_0:'data:image/png;base64,Ynl0ZXM=',ref_audio_0:'data:audio/wav;base64,Ynl0ZXM='});
    transport.mockClear();
    verify.mockResolvedValue('b'.repeat(64));
    try{await adapter.submit({images:[{uri:`asset://${hash}`,mime:'image/png',size:5}]} as never);throw new Error('expected rejection');}
    catch(error){expect(classifyProviderFailure('SUBMIT',error)).toMatchObject({disposition:'TERMINAL',error:{code:'LOCAL_INPUT_UNAVAILABLE'}});}
    expect(transport).not.toHaveBeenCalled();
  }finally{db.close();}
});

test.each(['asset://invalid','asset://'+'f'.repeat(64),'https://example.com/image.png'])('rejects unavailable or nonlocal input %s without a filesystem read',async uri=>{
  const db=createInitializedRealSqliteTestDb(),read=jest.fn();
  try{await expect(createInputReader(db as never,{read,hash:jest.fn(),root:'file:///app/'})(uri)).rejects.toThrow();expect(read).not.toHaveBeenCalled();}finally{db.close();}
});
