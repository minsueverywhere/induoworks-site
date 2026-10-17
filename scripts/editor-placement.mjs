import { villageWorld, terrainAt, objectFootprint, validFootprint, validHouse, footprintContains } from '../src/scripts/village-world.mjs';
export function placementObjects(catalog){
  const world=villageWorld(catalog);
  return [...catalog.workers.filter(w=>w.house).map(w=>({id:w.id,type:'house',point:w.house})),
    {id:'welcome',type:'sign',point:world.sign},{id:'noticeboard',type:'board',point:world.noticeboard},{id:'mascot',type:'character',point:world.mascot},
    ...world.decorations.map(d=>({id:d.id,type:d.type,point:d}))];
}
export function placementCells(catalog,type,id,proposed){
  const objects=placementObjects(catalog),point={...objects.find(o=>o.type===type&&o.id===id)?.point,...proposed};
  const lot=objectFootprint(point,type),world=villageWorld(catalog);
  if(!['width','depth'].every(k=>Number.isInteger(lot[k])&&lot[k]>=1&&lot[k]<=24)||!['x','y'].every(k=>Number.isFinite(lot[k])))return [];
  const others=objects.filter(o=>!(o.type===type&&o.id===id)&&
    (type==='house'||o.type==='house'||(type!=='grass'&&o.type!=='grass')));
  const cells=[];
  for(let y=lot.y;y<lot.y+lot.depth;y++)for(let x=lot.x;x<lot.x+lot.width;x++){
    const terrain=terrainAt(world,x,y);
    const error=terrain===null?'마을 밖에는 놓을 수 없어요.':
      terrain==='water'||(type!=='character'&&terrain!=='grass')?'길이나 물 위에는 놓을 수 없어요.':
      others.some(o=>footprintContains(o.point,o.type,{x,y}))?'다른 물체의 점유 영역과 겹쳐요.':'';
    cells.push({x,y,error});
  }
  return cells;
}
export function placementError(workers,id,point,world=villageWorld({workers})) {
  return objectPlacementError({workers,world},'house',id,point);
}
export function objectPlacementError(catalog,type,id,proposed){
  const point={...placementObjects(catalog).find(o=>o.type===type&&o.id===id)?.point,...proposed};
  if(!(type==='house'?validHouse(point):validFootprint(point,type)))return '점유 영역이 마을 안에 들어가도록 좌표·크기를 설정해 주세요.';
  return placementCells(catalog,type,id,point).find(cell=>cell.error)?.error||'';
}
export function paintError(catalog,point,type){
  if(!['x','y'].every(k=>Number.isInteger(point[k])&&point[k]>=0&&point[k]<24))return '마을 밖에는 칠할 수 없어요.';
  if(type==='grass')return '';
  return placementObjects(catalog).some(o=>footprintContains(o.point,o.type,point))?'먼저 위에 놓인 물체를 옮겨주세요.':'';
}
