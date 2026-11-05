import React from 'react';
import {act,create} from 'react-test-renderer';
import {RequestConsentActions} from './GenerationRequestReview';
import {ListAction} from '../ui/ListPageUI';
jest.mock('./WorkbenchUI',()=>({ParameterSheet:()=>null}));
test('batch consent remains opt-in, bound to its displayed count, and ignores duplicate confirmation',async()=>{
 let resolve!:()=>void;const confirm=jest.fn(()=>new Promise<void>(done=>{resolve=done;})),close=jest.fn();let tree!:ReturnType<typeof create>;
 try{await act(async()=>{tree=create(<RequestConsentActions count={3} onConfirm={confirm} onClose={close} error="" busy={false}/>);});
 const button=()=>tree.root.findAllByType(ListAction)[0];expect(button().props.disabled).toBe(true);
 const checks=tree.root.findAll(n=>n.props.accessibilityRole==='checkbox'&&typeof n.props.onPress==='function');
 expect(checks[1].props.accessibilityLabel).toContain('3 个请求各限一次');
 act(()=>checks[0].props.onPress());expect(button().props.disabled).toBe(true);
 act(()=>tree.root.findAllByType(ListAction)[1].props.onPress());expect(close).toHaveBeenCalledTimes(1);expect(confirm).not.toHaveBeenCalled();
 act(()=>checks[1].props.onPress());expect(button().props.disabled).toBe(false);
 act(()=>{button().props.onPress();button().props.onPress();});expect(confirm).toHaveBeenCalledTimes(1);
 await act(async()=>resolve());
 }finally{act(()=>tree.unmount());}
});
