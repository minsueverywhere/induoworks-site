import {isPath,isPond,noticeboard,villageSign,landscapeNoise as noise} from './village-layout.mjs';
export const WORLD_SIZE=24;
export const MAX_DECORATIONS=300;
export const MAX_WORLD_SIZE=64;
export const MAX_TILES=4096;
const tileIndexes=new WeakMap();
export function terrainBounds(world,padding=0){
  const xs=world.tiles.map(t=>t.x),ys=world.tiles.map(t=>t.y);
  return {minX:Math.max(-64,Math.min(...xs)-padding),maxX:Math.min(64,Math.max(...xs)+padding),minY:Math.max(-64,Math.min(...ys)-padding),maxY:Math.min(64,Math.max(...ys)+padding)};
}
export function groundPosition(point,type){if(['grass','character'].includes(type))return {x:point.x,y:point.y};const lot=objectFootprint(point,type);return {x:lot.x+(lot.width-1)/2,y:lot.y+(lot.depth-1)/2};}
export function worldLetters(world){return world.layoutVersion===2?world.decorations.filter(d=>d.type==='letter'):[...'INDUOHOOD'].map((char,i)=>({id:'letter-'+i,type:'letter',size:1,legacy:true,char,color:'#faefe5',x:world.sign.x,y:world.sign.y-i,width:1,depth:1}));}
export function setTerrain(world,x,y,type){
  const index=world.tiles.findIndex(t=>t.x===x&&t.y===y);
  if(type==='empty'){if(index>=0)world.tiles.splice(index,1);}
  else if(index>=0)world.tiles[index].type=type;
  else world.tiles.push({x,y,type});
  tileIndexes.delete(world.tiles);
}
// X/Y is the front corner tile; larger lots extend backwards along both grid axes.
export function objectFootprint(point,type='house'){
  let width=point.width===undefined?(type==='house'?2:1):point.width;
  let depth=point.depth===undefined?(type==='house'?2:1):point.depth;
  if(point.flip)[width,depth]=[depth,width];
  return {x:Math.round(point.x)-width+1,y:Math.round(point.y)-depth+1,width,depth};
}
export function validFootprint(point,type,world){
  const expanded=world?.layoutVersion===2,limit=expanded?64:WORLD_SIZE-1,maxSize=expanded?64:WORLD_SIZE;
  if(!point||('flip'in point&&typeof point.flip!=='boolean')||!['x','y'].every(k=>Number.isFinite(point[k])&&point[k]>=(expanded?-64:0)&&point[k]<=limit))return false;
  const lot=objectFootprint(point,type);
  return ['width','depth'].every(k=>Number.isInteger(lot[k])&&lot[k]>=1&&lot[k]<=maxSize)&&lot.x>=(expanded?-64:0)&&lot.y>=(expanded?-64:0)&&lot.x+lot.width<=limit+1&&lot.y+lot.depth<=limit+1;
}
export function validHouse(house,world){return validFootprint(house,'house',world)&&(!('style' in house)||['tent','cabin','house'].includes(house.style))&&['x','y'].every(k=>Number.isInteger(house[k]));}
export function footprintContains(point,type,target){
  const lot=objectFootprint(point,type),x=Math.round(target.x),y=Math.round(target.y);
  return x>=lot.x&&x<lot.x+lot.width&&y>=lot.y&&y<lot.y+lot.depth;
}
export function terrainAt(world,x,y){
  x=Math.round(x);y=Math.round(y);
  let cached=tileIndexes.get(world.tiles);
  if(!cached||cached.length!==world.tiles.length){cached={length:world.tiles.length,map:new Map(world.tiles.map(t=>[t.x+','+t.y,t]))};tileIndexes.set(world.tiles,cached);}
  return cached.map.get(x+','+y)?.type||null;
}
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
  const expanded=world?.layoutVersion===2;
  if(world?.layoutVersion!==undefined&&!expanded)throw new Error('Unsupported village layout');
  const point=(p,type)=>validFootprint(p,type,world);
  if(!point(world?.mascot,'character')||(!expanded&&!point(world?.sign,'sign'))||!point(world?.noticeboard,'board')||('size'in world.noticeboard&&(!Number.isFinite(world.noticeboard.size)||world.noticeboard.size<.5||world.noticeboard.size>1.6))||!Array.isArray(world.tiles)||
    (expanded?(world.tiles.length<1||world.tiles.length>MAX_TILES):world.tiles.length!==576)||
    !world.tiles.every((t,i)=>Number.isInteger(t.x)&&Number.isInteger(t.y)&&Math.abs(t.x)<=64&&Math.abs(t.y)<=64&&(expanded||(t.x===i%24&&t.y===Math.floor(i/24)))&&['grass','path','water'].includes(t.type))||
    new Set(world.tiles.map(t=>t.x+','+t.y)).size!==world.tiles.length||
    !Array.isArray(world.decorations)||world.decorations.length>MAX_DECORATIONS||
    !world.decorations.every(d=>/^[a-z0-9-]+$/.test(d.id)&&d.id.length<=80&&(expanded?['tree','grass','letter','sign']:['tree','grass','sign']).includes(d.type)&&point(d,d.type)&&Number.isFinite(d.size)&&d.size>=.5&&d.size<=1.6&&(!('flower'in d)||typeof d.flower==='boolean')&&(d.type!=='sign'||(typeof d.title==='string'&&d.title.length<=40))&&(d.type!=='letter'||(/^[A-Z0-9]$/.test(d.char)&&/^#[0-9a-fA-F]{6}$/.test(d.color))))||
    new Set(world.decorations.map(d=>d.id)).size!==world.decorations.length)throw new Error('Invalid village terrain or decorations');
  if(world.exhibits!==undefined&&(!Array.isArray(world.exhibits)||world.exhibits.length>100||!world.exhibits.every(e=>/^[a-z0-9-]+$/.test(e.id)&&e.id.length<=80&&['project','media','music'].includes(e.kind)&&typeof e.ref==='string'&&e.ref.length<=80&&point(e,'exhibit'))||new Set(world.exhibits.map(e=>e.id)).size!==world.exhibits.length||world.exhibits.some(e=>world.decorations.some(d=>d.id===e.id)||['noticeboard','mascot','welcome'].includes(e.id))))throw new Error('Invalid outdoor exhibits');
  const bounds=terrainBounds(world);
  if(bounds.maxX-bounds.minX>=MAX_WORLD_SIZE||bounds.maxY-bounds.minY>=MAX_WORLD_SIZE)throw new Error('Village terrain exceeds 64 by 64');
  return world;
}
