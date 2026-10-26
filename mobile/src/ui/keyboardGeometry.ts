export type WindowRect = { x:number; y:number; width:number; height:number };
export type KeyboardFrame = { screenX:number; screenY:number; width:number; height:number };

// All coordinates must be measured in the window, including nested pages and modal roots.
export function keyboardOverlap(view:WindowRect,keyboard?:KeyboardFrame):number {
  if(!keyboard || keyboard.height<=0 || keyboard.width<=0 || view.width<=0 || view.height<=0)return 0;
  if(keyboard.screenX>=view.x+view.width || keyboard.screenX+keyboard.width<=view.x)return 0;
  return Math.max(0,Math.min(view.height,view.y+view.height-keyboard.screenY));
}

export function focusedInputScrollOffset(view:WindowRect,input:WindowRect,offset:number,keyboard?:KeyboardFrame,gap=16):number {
  const top=view.y+gap,bottom=Math.min(view.y+view.height,keyboard?.height?keyboard.screenY:Infinity)-gap;
  if(bottom<=top)return offset;
  // Without caret geometry, preserve the visible part of a tall field instead of jumping to its top.
  const delta=input.height>bottom-top
    ? (input.y>=bottom ? input.y-top : input.y+input.height<=top ? input.y+input.height-bottom : 0)
    : input.y+input.height>bottom ? input.y+input.height-bottom : input.y<top ? input.y-top : 0;
  return Math.max(0,offset+delta);
}
