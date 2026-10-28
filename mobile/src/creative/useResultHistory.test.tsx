import React from 'react';
import {act,create} from 'react-test-renderer';
import {useResultHistory} from './useResultHistory';
import type {HistoryPage} from './resultHistory';
const mockPage=jest.fn();
jest.mock('expo-router',()=>({useFocusEffect:(fn:()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('./runtime',()=>({creativeService:()=>({resultHistoryPage:mockPage,versionsByIds:async(ids:string[])=>ids.map(id=>({id,createdAt:Number(id.slice(1)),recipe:{}}))})}));
let value!:ReturnType<typeof useResultHistory>;
function Probe({query=''}:{query?:string}){value=useResultHistory({assetIds:['asset']},true,query);return null;}
const page=(ids:string[],cursor?:string):HistoryPage=>({ids,stamp:ids.join(','),next:cursor?{id:cursor,createdAt:Number(cursor.slice(1))}:undefined});
beforeEach(()=>{mockPage.mockReset();});

test('head insertions keep loaded results and continuation reaches the old tail without duplicates',async()=>{
  jest.useFakeTimers();let tree!:ReturnType<typeof create>;
  mockPage.mockResolvedValueOnce(page(['v3','v2'],'v2'));
  try{
    await act(async()=>{tree=create(<Probe/>);});
    mockPage.mockResolvedValueOnce(page(['v1']));
    await act(async()=>value.loadMore());
    mockPage.mockResolvedValueOnce(page(['v5','v4'],'v4'));
    await act(async()=>jest.advanceTimersByTime(2500));
    expect(value.rows.map(v=>v.id)).toEqual(['v5','v4','v3','v2','v1']);
    mockPage.mockResolvedValueOnce(page(['v3','v2'],'v2'));
    await act(async()=>{value.loadMore();value.loadMore();});
    expect(mockPage).toHaveBeenCalledTimes(4);
    expect(value.next?.id).toBe('v2');
    expect(new Set(value.rows.map(v=>v.id)).size).toBe(5);
  }finally{act(()=>tree?.unmount());jest.useRealTimers();}
});
test('a slow obsolete search cannot overwrite the new query',async()=>{
  let release!:(page:HistoryPage)=>void,tree!:ReturnType<typeof create>;
  mockPage.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  try{
    await act(async()=>{tree=create(<Probe query="old"/>);});
    mockPage.mockResolvedValueOnce(page(['v9']));
    await act(async()=>tree.update(<Probe query="new"/>));
    await act(async()=>release(page(['v1'])));
    expect(value.rows.map(v=>v.id)).toEqual(['v9']);
  }finally{act(()=>tree?.unmount());}
});
