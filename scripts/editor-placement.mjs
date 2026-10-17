import { isPath, isPond, noticeboard, villageSign } from '../src/scripts/village-layout.mjs';
export function placementError(workers,id,point) {
  if(!['x','y'].every(k=>Number.isInteger(point[k]) && point[k]>=0 && point[k]<=22))return '집은 마을 안의 0–22 좌표에 놓아주세요.';
  if(isPath(point.x,point.y)||isPond(point.x,point.y))return '길이나 연못 위에는 집을 놓을 수 없어요.';
  if([noticeboard,villageSign,...workers.filter(w=>w.id!==id&&w.house).map(w=>w.house)].some(p=>Math.abs(p.x-point.x)<2&&Math.abs(p.y-point.y)<2))return '다른 집이나 마을 장식과 너무 가까워요.';
  return '';
}
