import { villageWorld, terrainAt, objectFootprint, validFootprint, validHouse, footprintContains, terrainBounds, MAX_TILES } from '../src/scripts/village-world.mjs';
import {villageContent} from '../src/scripts/village-content.mjs';
import {roomFloors} from '../src/scripts/village-room.mjs';
export function roomCatalog(catalog,workerId,level=0){return {workers:[],room:true,world:{layoutVersion:2,...roomFloors(catalog.workers.find(w=>w.id===workerId))[level],decorations:villageContent(catalog,'ko','').places.filter(p=>p.area==='room'&&p.owner===workerId&&(p.floor||0)===level&&!p.editType).map(p=>({id:p.id,type:'roomItem',x:p.x,y:p.y,width:1,depth:1}))}};}
export function placementObjects(catalog){
  const world=villageWorld(catalog);
  return [...catalog.workers.filter(w=>w.house).map(w=>({id:w.id,type:'house',point:w.house})),
    ...(world.sign?[{id:'welcome',type:'sign',point:world.sign}]:[]),...(world.noticeboard?[{id:'noticeboard',type:'board',point:world.noticeboard}]:[]),...(world.mascot?[{id:'mascot',type:'character',point:world.mascot}]:[]),
    ...world.decorations.filter(d=>d.type!=='grass').map(d=>({id:d.id,type:d.type,point:d})),...(world.exhibits||[]).map(e=>({id:e.id,type:'exhibit',point:e}))];
}
export function placementCells(catalog,type,id,proposed){
  const objects=placementObjects(catalog),point={...objects.find(o=>o.type===type&&o.id===id)?.point,...proposed};
  const lot=objectFootprint(point,type),world=villageWorld(catalog);
  if(!['width','depth'].every(k=>Number.isInteger(lot[k])&&lot[k]>=1&&lot[k]<=64)||!['x','y'].every(k=>Number.isFinite(lot[k])))return [];
  // Saved catalogs may still hold legacy grass entries; save-time validation checks them too,
  // and grass may overlap anything except a house.
  const others=objects.filter(o=>!(o.type===type&&o.id===id)&&
    (type==='house'||o.type==='house'||(type!=='grass'&&o.type!=='grass')));
  const cells=[];
  for(let y=lot.y;y<lot.y+lot.depth;y++)for(let x=lot.x;x<lot.x+lot.width;x++){
    const terrain=terrainAt(world,x,y);
    const error=terrain===null?'바닥 타일 위에만 놓을 수 있어요.':
      terrain==='water'||terrain==='transparent'||(!['character','exhibit'].includes(type)&&!['grass','floor'].includes(terrain))?'길이나 물 위에는 놓을 수 없어요.':
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
  if(!(type==='house'?validHouse(point,villageWorld(catalog)):validFootprint(point,type,villageWorld(catalog))))return '점유 영역이 마을 안에 들어가도록 좌표·크기를 설정해 주세요.';
  return placementCells(catalog,type,id,point).find(cell=>cell.error)?.error||'';
}
export function paintError(catalog,point,type){
  const world=villageWorld(catalog),expanded=world.layoutVersion===2;
  if(!['x','y'].every(k=>Number.isInteger(point[k])&&point[k]>=(expanded?-64:0)&&point[k]<=(expanded?64:23)))return '마을 밖에는 칠할 수 없어요.';
  const existing=terrainAt(world,point.x,point.y);
  if(type==='empty'&&world.tiles.length<=1&&existing)return '마지막 지형 한 칸은 남겨주세요.';
  if(!existing&&type!=='empty'){
    const b=terrainBounds(world),limit=catalog.room?24:64;
    if(world.tiles.length>=(catalog.room?576:MAX_TILES)||Math.max(b.maxX,point.x)-Math.min(b.minX,point.x)>=limit||Math.max(b.maxY,point.y)-Math.min(b.minY,point.y)>=limit)return '지형은 최대 '+limit+'×'+limit+' 범위까지 확장할 수 있어요.';
  }
  if(type==='grass'||type==='floor')return '';
  return placementObjects(catalog).some(o=>footprintContains(o.point,o.type,point))?'먼저 위에 놓인 물체를 옮겨주세요.':'';
}
