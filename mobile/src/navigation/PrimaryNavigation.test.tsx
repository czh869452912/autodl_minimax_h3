import React from 'react';
import {act,create} from 'react-test-renderer';
import {PrimaryNavigationProvider,PrimaryTabBar,usePrimaryNavigationGuard} from './PrimaryNavigation';
const state={index:0,routes:['create','agent','projects','assets'].map(name=>({name,key:name}))};
test('primary navigation waits for the current guard and honours tab cancellation',()=>{
 let proceed:(()=>void)|undefined;const navigate=jest.fn(),emit=jest.fn(()=>({defaultPrevented:false}));
 function Guard(){usePrimaryNavigationGuard('create',next=>{proceed=next;});return null;}
 let tree!:ReturnType<typeof create>;
 try{act(()=>{tree=create(<PrimaryNavigationProvider><Guard/><PrimaryTabBar state={state} navigation={{navigate,emit}}/></PrimaryNavigationProvider>);});
 const press=(label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0].props.onPress();
 act(()=>press('创作'));expect(proceed).toBeUndefined();
 act(()=>press('素材'));expect(navigate).not.toHaveBeenCalled();
 act(()=>proceed?.());expect(navigate).toHaveBeenCalledWith('assets');
 emit.mockReturnValue({defaultPrevented:true});act(()=>press('项目'));act(()=>proceed?.());expect(navigate).toHaveBeenCalledTimes(1);
 }finally{act(()=>tree?.unmount());}
});
