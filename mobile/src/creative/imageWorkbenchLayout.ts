/** React Native dimensions are dp; never scale controls by physical pixel width. */
export function imageWorkbenchLayout(width:number,height:number,fontScale=1) {
  const sideBySide=width>=760 && width/fontScale>=600 && height>=280;
  return {sideBySide,panelWidth:Math.min(360,Math.max(280,width*0.32)),panelHeight:Math.min(320,Math.max(0,height*0.48)),short:height<480};
}
