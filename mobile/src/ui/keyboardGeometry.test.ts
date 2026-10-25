import {keyboardOverlap,focusedInputScrollOffset} from './keyboardGeometry';
const keyboard={screenX:0,screenY:500,width:400,height:300};
test('includes every ancestor header and safe area in overlap instead of assuming a zero-origin page',()=>{
  expect(keyboardOverlap({x:0,y:80,width:400,height:720},keyboard)).toBe(300);
  expect(keyboardOverlap({x:0,y:144,width:400,height:656},keyboard)).toBe(300);
  expect(keyboardOverlap({x:0,y:0,width:400,height:800},keyboard)).toBe(300);
});
test('does not reserve keyboard space twice after native adjustResize or an enclosing surface resizes',()=>{
  expect(keyboardOverlap({x:0,y:80,width:400,height:420},keyboard)).toBe(0);
  expect(keyboardOverlap({x:0,y:144,width:400,height:356},keyboard)).toBe(0);
  expect(keyboardOverlap({x:0,y:80,width:400,height:660},keyboard)).toBe(240);
  expect(keyboardOverlap({x:0,y:80,width:400,height:720},undefined)).toBe(0);
});
test('handles modal origins, horizontal exclusion and zero-size hidden surfaces',()=>{
  expect(keyboardOverlap({x:0,y:24,width:400,height:776},keyboard)).toBe(300);
  expect(keyboardOverlap({x:500,y:0,width:400,height:800},keyboard)).toBe(0);
  expect(keyboardOverlap({x:0,y:0,width:0,height:0},keyboard)).toBe(0);
});
test('reveals a lower field even when keyboard was already open before the focus changed',()=>{
  const view={x:0,y:80,width:400,height:420};
  expect(focusedInputScrollOffset(view,{x:16,y:460,width:368,height:48},200,keyboard)).toBe(224);
  expect(focusedInputScrollOffset(view,{x:16,y:300,width:368,height:48},200,keyboard)).toBe(200);
  expect(focusedInputScrollOffset(view,{x:16,y:60,width:368,height:48},200,keyboard)).toBe(164);
});
test('accounts for an action footer above the keyboard and does not scroll beyond the start',()=>{
  const view={x:0,y:80,width:400,height:340};
  expect(focusedInputScrollOffset(view,{x:16,y:380,width:368,height:48},100,keyboard)).toBe(124);
  expect(focusedInputScrollOffset(view,{x:16,y:40,width:368,height:48},0,keyboard)).toBe(0);
});
test('does not oscillate while editing a multiline field taller than the keyboard viewport',()=>{
  const view={x:0,y:80,width:400,height:200};
  expect(focusedInputScrollOffset(view,{x:16,y:96,width:368,height:300},100,keyboard)).toBe(100);
  expect(focusedInputScrollOffset(view,{x:16,y:360,width:368,height:300},100,keyboard)).toBe(364);
});
