export function musicPosition(point,size,viewport,dock=''){
  const margin=10,handle=32,maxY=Math.max(margin,viewport.height-size.height-margin);
  return {x:dock==='left'?handle-size.width:dock==='right'?viewport.width-handle:Math.max(margin,Math.min(point.x,Math.max(margin,viewport.width-size.width-margin))),y:Math.max(margin,Math.min(point.y,maxY))};
}
export const musicDock=(point,size,width)=>point.x<20?'left':point.x+size.width>width-20?'right':'';
