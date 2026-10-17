import {terrainBounds,validFootprint} from './village-world.mjs';
import {toScreen,toTile} from './village-camera.mjs';
const defaultFloor={wallHeight:90,tiles:Array.from({length:100},(_,i)=>({x:i%10,y:Math.floor(i/10),type:'floor'})),exhibits:[]};
export const roomFloors=worker=>worker?.room?.floors||[defaultFloor];
export const roomElevation=(worker,level)=>roomFloors(worker).slice(0,level).reduce((height,floor)=>height+floor.wallHeight+8,0);
export function roomStack(worker,selected){
  let elevation=0;
  return roomFloors(worker).slice(0,selected+1).map((floor,index)=>{const layer={floor,index,elevation,opacity:index===selected?1:.22};elevation+=floor.wallHeight+8;return layer;});
}
export function roomScreen(point,worker,level){const p=toScreen(point.x,point.y);return {x:p.x,y:p.y-roomElevation(worker,level)};}
export const roomPoint=(point,worker,level)=>toTile(point.x,point.y+roomElevation(worker,level));
export function validateRoom(room){
  if(!room||!Array.isArray(room.floors)||room.floors.length<1||room.floors.length>3)throw new Error('작업실은 1–3층으로 설정해 주세요.');
  for(const floor of room.floors){
    if(!Number.isInteger(floor.wallHeight)||floor.wallHeight<24||floor.wallHeight>240||!Array.isArray(floor.tiles)||floor.tiles.length<1||floor.tiles.length>576||
      !floor.tiles.every(t=>Number.isInteger(t.x)&&Number.isInteger(t.y)&&Math.abs(t.x)<=64&&Math.abs(t.y)<=64&&t.type==='floor')||new Set(floor.tiles.map(t=>t.x+','+t.y)).size!==floor.tiles.length)throw new Error('작업실 바닥·벽 높이를 확인해 주세요.');
    const b=terrainBounds(floor);
    if(b.maxX-b.minX>=24||b.maxY-b.minY>=24)throw new Error('층별 바닥은 최대 24×24 범위입니다.');
    if(!Array.isArray(floor.exhibits)||floor.exhibits.length>100||!floor.exhibits.every(e=>/^[a-z0-9-]+$/.test(e.id)&&e.id.length<=80&&['project','media','music'].includes(e.kind)&&typeof e.ref==='string'&&e.ref.length<=80&&validFootprint(e,'exhibit',{layoutVersion:2}))||new Set(floor.exhibits.map(e=>e.id)).size!==floor.exhibits.length)throw new Error('작업실 전시물을 확인해 주세요.');
  }
  return room;
}
