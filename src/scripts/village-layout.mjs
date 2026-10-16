export const villageSign = { x: 2, y: 12 };
export const noticeboard = { x: 9, y: 21 };
export function signLetterLayout(metrics,gap=4) {
  let cursor=0;
  const positions=metrics.map(m=>{
    const x=cursor+m.actualBoundingBoxLeft;
    cursor+=m.actualBoundingBoxLeft+m.actualBoundingBoxRight+gap;
    return x;
  });
  return {positions,width:Math.max(0,cursor-gap)};
}
export function isPond(x,y) { return x >= 16 && x <= 21 && y >= 15 && y <= 20; }
export function isPath(x,y) {
  return (x===10&&y>=8&&y<24) || (x>=9&&x<=11&&y>=9&&y<=11) || (y===8&&x>=4&&x<=12) || (x===4&&y>=3&&y<=8) || (x===12&&y>=5&&y<=8);
}
// Fixed coordinate noise keeps the landscape stable across redraws and visits.
export function landscapeNoise(x,y,salt=0) {
  let n=Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^Math.imul(salt+1,1442695041);
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967296;
}
