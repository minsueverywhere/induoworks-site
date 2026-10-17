import { villageWorld, terrainAt } from '../src/scripts/village-world.mjs';
export function placementError(workers,id,point,world=villageWorld({workers})) {
  return objectPlacementError({workers,world},'house',id,point);
}
export function objectPlacementError(catalog,type,id,point){
  if(!['x','y'].every(k=>Number.isFinite(point[k])&&point[k]>=0&&point[k]<=23))return '마을 안의 0–23 좌표에 놓아주세요.';
  if(type==='house'&&!['x','y'].every(k=>Number.isInteger(point[k])&&point[k]<=22))return '집은 0–22 정수 좌표에 놓아주세요.';
  const world=villageWorld(catalog);
  if(type==='character')return terrainAt(world,point.x,point.y)==='water'?'물 위에는 놓을 수 없어요.':'';
  if(terrainAt(world,point.x,point.y)!=='grass')return '길이나 물 위에는 놓을 수 없어요.';
  if(type==='grass')return '';
  const others=[...catalog.workers.filter(w=>w.id!==id&&w.house).map(w=>w.house),
    ...(id==='welcome'?[]:[world.sign]),...(id==='noticeboard'?[]:[world.noticeboard])];
  const distance=type==='tree'?1.5:2;
  if(others.some(p=>Math.abs(p.x-point.x)<distance&&Math.abs(p.y-point.y)<distance))return '집이나 마을 장식과 너무 가까워요.';
  if(world.decorations.some(d=>d.type==='tree'&&d.id!==id&&Math.hypot(d.x-point.x,d.y-point.y)<(type==='tree'?1:1.5)))return '나무와 너무 가까워요.';
  return '';
}
export function paintError(catalog,point,type){
  if(!['x','y'].every(k=>Number.isInteger(point[k])&&point[k]>=0&&point[k]<24))return '마을 밖에는 칠할 수 없어요.';
  if(type==='grass')return '';
  const world=villageWorld(catalog),occupants=[...catalog.workers.filter(w=>w.house).map(w=>w.house),world.sign,world.noticeboard,world.mascot,...world.decorations];
  return occupants.some(p=>Math.round(p.x)===point.x&&Math.round(p.y)===point.y)?'먼저 위에 놓인 물체를 옮겨주세요.':'';
}
