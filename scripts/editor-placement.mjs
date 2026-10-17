import { villageWorld, terrainAt, houseFootprint, validHouse, houseContains } from '../src/scripts/village-world.mjs';
export function placementError(workers,id,point,world=villageWorld({workers})) {
  return objectPlacementError({workers,world},'house',id,point);
}
export function objectPlacementError(catalog,type,id,point){
  if(!['x','y'].every(k=>Number.isFinite(point[k])&&point[k]>=0&&point[k]<=23))return '마을 안의 0–23 좌표에 놓아주세요.';
  const world=villageWorld(catalog);
  const houses=catalog.workers.filter(w=>w.house&&(type!=='house'||w.id!==id)).map(w=>w.house);
  if(type==='house'){
    const house={...catalog.workers.find(w=>w.id===id)?.house,...point};
    if(!validHouse(house))return '집의 점유 영역이 마을 안에 들어가도록 정수 좌표·크기를 설정해 주세요.';
    const lot=houseFootprint(house);
    for(let y=lot.y;y<lot.y+lot.depth;y++)for(let x=lot.x;x<lot.x+lot.width;x++){
      if(terrainAt(world,x,y)!=='grass')return '집이 차지하는 칸이 길이나 물과 겹쳐요. 잔디에 놓아주세요.';
      if(houses.some(h=>houseContains(h,{x,y})))return '다른 집의 점유 영역과 겹쳐요.';
    }
    if([world.sign,world.noticeboard,world.mascot,...world.decorations].some(p=>houseContains(house,p)))return '집의 점유 영역에 다른 물체가 있어요.';
  }else if(houses.some(h=>houseContains(h,point)))return '집의 점유 영역에는 놓을 수 없어요.';
  if(type==='character')return terrainAt(world,point.x,point.y)==='water'?'물 위에는 놓을 수 없어요.':'';
  if(terrainAt(world,point.x,point.y)!=='grass')return '길이나 물 위에는 놓을 수 없어요.';
  if(type==='grass')return '';
  const others=[...houses,...(id==='welcome'?[]:[world.sign]),...(id==='noticeboard'?[]:[world.noticeboard])];
  const distance=type==='tree'?1.5:2;
  if(others.some(p=>Math.abs(p.x-point.x)<distance&&Math.abs(p.y-point.y)<distance))return '집이나 마을 장식과 너무 가까워요.';
  if(world.decorations.some(d=>d.type==='tree'&&d.id!==id&&Math.hypot(d.x-point.x,d.y-point.y)<(type==='tree'?1:1.5)))return '나무와 너무 가까워요.';
  return '';
}
export function paintError(catalog,point,type){
  if(!['x','y'].every(k=>Number.isInteger(point[k])&&point[k]>=0&&point[k]<24))return '마을 밖에는 칠할 수 없어요.';
  if(type==='grass')return '';
  const world=villageWorld(catalog);
  if(catalog.workers.some(w=>w.house&&houseContains(w.house,point)))return '먼저 위에 놓인 집을 옮겨주세요.';
  const occupants=[world.sign,world.noticeboard,world.mascot,...world.decorations];
  return occupants.some(p=>Math.round(p.x)===point.x&&Math.round(p.y)===point.y)?'먼저 위에 놓인 물체를 옮겨주세요.':'';
}
