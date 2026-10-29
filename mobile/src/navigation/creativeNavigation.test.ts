import {projectScreenIdentity,returnToProject} from './creativeNavigation';
const {StackRouter}=require('expo-router/build/react-navigation/routers/StackRouter');
const mockProject=jest.fn();
jest.mock('../creative/runtime',()=>({creativeService:()=>({project:mockProject})}));
test('real stack reducer returns to the same project key for three edit cycles and preserves other project identities',()=>{
 const router=StackRouter({}),options={routeNames:['(tabs)','creative-project/[id]','creative-draft/[id]'],routeParamList:{},routeGetIdList:{'creative-project/[id]':({params}:any)=>projectScreenIdentity('',params)}};
 let state=router.getInitialState(options);
 const dispatch=(type:string,name:string,params?:Record<string,string>)=>{state=router.getStateForAction(state,{type,payload:{name,params}},options);};
 dispatch('PUSH','creative-project/[id]',{id:'other'});
 dispatch('PUSH','creative-project/[id]',{id:'project',tab:'shots'});
 const key=state.routes[2].key;
 for(let i=0;i<3;i++){
  dispatch('PUSH','creative-draft/[id]',{id:'draft'+i});
  dispatch('POP_TO','creative-project/[id]',{id:'project',tab:'shots',shotId:'shot'+i});
  expect(state.routes).toHaveLength(3);expect(state.routes[2].key).toBe(key);expect(state.routes[2].params.shotId).toBe('shot'+i);
 }
 dispatch('POP_TO','creative-project/[id]',{id:'other'});
 expect(state.routes).toHaveLength(2);expect(state.routes[1].params.id).toBe('other');
});
test('an absent source project returns to the project list',async()=>{
 mockProject.mockResolvedValue(null);const router={dismissTo:jest.fn()};
 await returnToProject(router as any,{projectId:'gone',shotId:'s'});
 expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/projects');
});
