import {isPath,isPond,noticeboard,villageSign,landscapeNoise as noise} from './village-layout.mjs';
export const WORLD_SIZE=24;
export const MAX_DECORATIONS=300;
// X/Y is the front corner tile; larger lots extend backwards along both grid axes.
export function houseFootprint(house){
  const {width=2,depth=2}=house;
  return {x:house.x-width+1,y:house.y-depth+1,width,depth};
}
export function validHouse(house){
  return house&&['x','y'].every(k=>Number.isInteger(house[k]))&&
    ['width','depth'].every(k=>{const value=house[k]===undefined?2:house[k];return Number.isInteger(value)&&value>=1&&value<=WORLD_SIZE;})&&
    houseFootprint(house).x>=0&&houseFootprint(house).y>=0&&house.x<WORLD_SIZE&&house.y<WORLD_SIZE;
}
export function houseContains(house,point){
  const lot=houseFootprint(house),x=Math.round(point.x),y=Math.round(point.y);
  return x>=lot.x&&x<lot.x+lot.width&&y>=lot.y&&y<lot.y+lot.depth;
}
export function terrainAt(world,x,y){x=Math.round(x);y=Math.round(y);return x<0||y<0||x>=24||y>=24?null:world.tiles[y*24+x]?.type;}
export function villageWorld(catalog){
  if(catalog.world)return catalog.world;
  const world={mascot:{x:9,y:10},sign:{...villageSign},noticeboard:{...noticeboard},tiles:[],decorations:[]};
  for(let y=0;y<24;y++)for(let x=0;x<24;x++)world.tiles.push({x,y,type:isPond(x,y)?'water':isPath(x,y)?'path':'grass'});
  const houses=catalog.workers.filter(w=>w.house).map(w=>w.house),trees=[];
  for(let tx=1;tx<23;tx++)for(let ty=1;ty<23;ty++){
    if(noise(tx,ty,9)>.14)continue;
    const x=tx+(noise(tx,ty,10)-.5)*1.2,y=ty+(noise(tx,ty,11)-.5)*1.2;
    if(!(x<5||y<4||x>19||y>19)||terrainAt(world,x,y)!=='grass'||(x>8.5&&x<14.5&&y>=7))continue;
    if(x<4.5&&y>5&&y<19||[world.noticeboard,...houses].some(p=>Math.abs(p.x-x)<2.5&&Math.abs(p.y-y)<2.5))continue;
    if(trees.some(t=>Math.hypot(t.x-x,t.y-y)<2.3))continue;
    trees.push({id:'tree-'+trees.length,type:'tree',x,y,size:.8+noise(tx,ty,12)*.35});
  }
  world.decorations.push(...trees);
  for(let x=0;x<24;x++)for(let y=0;y<24;y++)if(terrainAt(world,x,y)==='grass'&&noise(Math.floor(x/3),Math.floor(y/3),4)<.55&&noise(x,y,1)<.28)
    world.decorations.push({id:'grass-'+x+'-'+y,type:'grass',x:Math.max(0,Math.min(23,x+(noise(x,y,2)-.5)*.7)),y:Math.max(0,Math.min(23,y+(noise(x,y,3)-.5)*.7)),size:1,flower:noise(x,y,5)<.35});
  return world;
}
export function validateWorld(world){
  const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=23&&p.y<=23;
  if(!point(world?.mascot)||!point(world?.sign)||!point(world.noticeboard)||!Array.isArray(world.tiles)||world.tiles.length!==576||
    !world.tiles.every((t,i)=>t.x===i%24&&t.y===Math.floor(i/24)&&['grass','path','water'].includes(t.type))||
    !Array.isArray(world.decorations)||world.decorations.length>MAX_DECORATIONS||
    !world.decorations.every(d=>/^[a-z0-9-]+$/.test(d.id)&&d.id.length<=80&&['tree','grass'].includes(d.type)&&point(d)&&Number.isFinite(d.size)&&d.size>=.5&&d.size<=1.6&&(!('flower'in d)||typeof d.flower==='boolean'))||
    new Set(world.decorations.map(d=>d.id)).size!==world.decorations.length)throw new Error('Invalid village terrain or decorations');
  return world;
}
