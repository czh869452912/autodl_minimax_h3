import {imageWorkbenchLayout} from './imageWorkbenchLayout';
test('narrow and keyboard-constrained workspaces keep more than half the region for the canvas',()=>{
  for(const [width,height] of [[360,420],[412,650],[360,180]]){
    const layout=imageWorkbenchLayout(width,height);
    expect(layout.sideBySide).toBe(false);expect(layout.panelHeight).toBeLessThan(height/2);
  }
});
test('landscape and tablets use a bounded sidebar, large text returns to stacked tools',()=>{
  expect(imageWorkbenchLayout(900,400)).toMatchObject({sideBySide:true,panelWidth:288});
  expect(imageWorkbenchLayout(1400,900).panelWidth).toBe(360);
  expect(imageWorkbenchLayout(800,400,1.6).sideBySide).toBe(false);
});
