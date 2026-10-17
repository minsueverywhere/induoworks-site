import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {validateCatalog} from '../src/content-schema.mjs';
import {terrainAt,terrainBounds,setTerrain,groundPosition,objectFootprint,validateWorld} from '../src/scripts/village-world.mjs';
import {placementObjects,objectPlacementError,paintError} from './editor-placement.mjs';
import {villageContent} from '../src/scripts/village-content.mjs';
import {toScreen,clampCamera,toTile} from '../src/scripts/village-camera.mjs';
import {createHistory} from './editor/history.mjs';
const original=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8'));

test('compact default preserves both studios and nine trees, reserves visible footprints and has only decorative letters',()=>{
  validateCatalog(original);
  assert.equal(original.world.tiles.length,144);
  assert.deepEqual(terrainBounds(original.world),{minX:0,maxX:11,minY:0,maxY:11});
  assert.equal(original.world.decorations.filter(d=>d.type==='tree').length,9);
  assert.deepEqual(original.workers.filter(w=>w.house).map(w=>[w.house.width,w.house.depth]),[[2,2]]);
  assert.deepEqual([original.world.noticeboard.width,original.world.noticeboard.depth],[1,3]);
  for(const o of placementObjects(original))assert.equal(objectPlacementError(original,o.type,o.id,o.point),'',o.id);
  const letters=original.world.decorations.filter(d=>d.type==='letter');
  assert.equal(letters.map(d=>d.char).join(''),'INDUOHOOD');
  const scene=villageContent(original,'ko','Induohood');
  assert.equal(scene.places.some(p=>p.id==='welcome'||p.shape==='sign'||p.shape==='letter'),false);
});

test('empty terrain expands in all directions, respects occupied cells and undoes a whole stroke',()=>{
  let data=structuredClone(original);const history=createHistory();history.reset(data);history.begin();
  for(const point of [{x:-1,y:0},{x:-2,y:0},{x:-3,y:0},{x:12,y:11}]){
    assert.equal(paintError(data,point,'grass'),'');setTerrain(data.world,point.x,point.y,'grass');history.record(data);
  }
  history.end(data);assert.equal(data.world.tiles.length,148);validateCatalog(data);
  assert.equal(terrainAt(data.world,-3,0),'grass');
  data=history.undo(data);assert.deepEqual(data.world,original.world);
  data=history.redo(data);assert.equal(terrainAt(data.world,-2,0),'grass');
  assert.ok(paintError(data,data.workers.find(w=>w.house).house,'empty'));
  assert.equal(paintError(data,{x:-3,y:0},'empty'),'');setTerrain(data.world,-3,0,'empty');
  assert.equal(terrainAt(data.world,-3,0),null);
  assert.ok(paintError(data,{x:64,y:0},'grass'));assert.ok(paintError(data,{x:-65,y:0},'grass'));
  const world={...data.world,tiles:[{x:0,y:0,type:'grass'}]};assert.ok(paintError({...data,world},{x:0,y:0},'empty'));
  const bounds=terrainBounds(data.world,3),camera=toTile(...Object.values(clampCamera(toScreen(-99,99),bounds)));
  assert.ok(Math.abs(camera.x-bounds.minX)<.001&&Math.abs(camera.y-bounds.maxY)<.001);
});

test('letter character and color validation rejects injected text and incomplete terrain',()=>{
  for(const change of [d=>d.world.layoutVersion=3,d=>d.world.tiles.push(d.world.tiles[0]),d=>d.world.tiles=[],d=>d.world.tiles[0].x=65,
    d=>d.world.decorations.find(o=>o.type==='letter').char='a',d=>d.world.decorations.find(o=>o.type==='letter').char='AA',
    d=>d.world.decorations.find(o=>o.type==='letter').color='url(x)']){
    const bad=structuredClone(original);change(bad);assert.throws(()=>validateCatalog(bad));
  }
  const data=structuredClone(original);setTerrain(data.world,12,0,'grass');
  data.world.decorations.push({id:'letter-extra',type:'letter',x:12,y:0,width:1,depth:1,size:1,char:'9',color:'#123abc'});
  validateWorld(data.world);assert.equal(objectPlacementError(data,'letter','letter-extra',{x:12,y:0}),'');
  setTerrain(data.world,12,0,'empty');assert.ok(objectPlacementError(data,'letter','letter-extra',{x:12,y:0}));
});

test('dragging a multi-cell house updates the drawing, click target and footprint to one floor center',async()=>{
  const source=(await readFile(new URL('./editor/bridge.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
  const world={layoutVersion:2,tiles:Array.from({length:144},(_,i)=>({x:i%12,y:Math.floor(i/12),type:'grass'})),decorations:[],mascot:{x:0,y:0},noticeboard:{x:11,y:11}};
  const worker={id:'hub',house:{x:3,y:3,width:2,depth:3}},place={id:'hub',shape:'house',area:'village',roomLevel:0,ground:groundPosition(worker.house,'house'),...worker.house,width:96};
  const object={...place},handlers={},window={postMessage(){},addEventListener(type,fn){handlers['window:'+type]=fn;}};
  const context={window,parent:window,document:{documentElement:{dataset:{}}},location:{origin:'http://localhost:4323'},root:{dataset:{}},remoteContent:{workers:[worker]},sceneWorld:world,objects:[object],places:[place],area:'village',roomLevel:0,hovered:'',width:0,height:0,scale:1,camera:{x:0,y:0},canvas:{focus(){}},requestDraw(){},placementObjects,objectPlacementError,groundPosition,toScreen,scene:{getBoundingClientRect(){return{left:0,top:0};},setPointerCapture(){},addEventListener(type,fn){handlers[type]=fn;}}};
  context.life={on:(target,...args)=>target.addEventListener(...args)};
  runInNewContext(source,context);
  handlers['window:message']({origin:context.location.origin,source:window,data:{source:'induo-editor',tool:'move'}});
  const event=(x,y)=>({clientX:x,clientY:y,pointerId:1,button:0,target:{closest:()=>({dataset:{object:'hub'}})},stopImmediatePropagation(){},preventDefault(){}});
  const down=event(0,0);down.target.closest=selector=>selector==='[data-object]'?{dataset:{object:'hub'}}:null;
  handlers.pointerdown(down);handlers.pointermove(event(24,12));handlers.pointerup(event(24,12));
  assert.equal(worker.house.x,4);assert.equal(worker.house.y,3);
  const lot=objectFootprint(worker.house),center={x:lot.x+(lot.width-1)/2,y:lot.y+(lot.depth-1)/2};
  assert.deepEqual({...object.ground},center);assert.deepEqual({...place.ground},center);
  assert.equal(object.width,96,'hitbox dimensions must not become lot dimensions');
});
