import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {villageWorld,validateWorld,terrainAt,MAX_DECORATIONS,houseFootprint,validHouse} from '../src/scripts/village-world.mjs';
import {objectPlacementError,paintError} from './editor-placement.mjs';
import {validateCatalog} from '../src/content-schema.mjs';
import {villageContent} from '../src/scripts/village-content.mjs';
import {contentWorks} from '../src/scripts/content-catalog.mjs';
import {runInNewContext} from 'node:vm';
import {toScreen,toTile} from '../src/scripts/village-camera.mjs';
const original=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8'));

test('house lots protect every tile when moving, resizing, planting or painting',()=>{
  const data={workers:[{id:'a',house:{x:6,y:6,width:3,depth:2}},{id:'b',house:{x:10,y:10}}],world:{tiles:Array.from({length:576},(_,i)=>({x:i%24,y:Math.floor(i/24),type:'grass'})),decorations:[],sign:{x:22,y:22},noticeboard:{x:22,y:19},mascot:{x:0,y:0}}};
  assert.deepEqual(houseFootprint(data.workers[0].house),{x:4,y:5,width:3,depth:2});
  assert.deepEqual(houseFootprint(data.workers[1].house),{x:9,y:9,width:2,depth:2});
  assert.equal(objectPlacementError(data,'house','a',{x:6,y:6}),'');
  for(const type of ['tree','grass','sign','board','character'])assert.ok(objectPlacementError(data,type,'new',{x:4,y:5}),type);
  assert.ok(objectPlacementError(data,'grass','a',{x:4,y:5}),'decoration IDs cannot bypass a house lot');
  assert.ok(paintError(data,{x:4,y:5},'water'));assert.equal(paintError(data,{x:4,y:5},'grass'),'');
  assert.equal(paintError(data,{x:3,y:5},'path'),'');
  assert.ok(objectPlacementError(data,'house','b',{x:5,y:5}),'overlap away from both anchors');
  assert.ok(objectPlacementError(data,'house','b',{x:10,y:10,width:7,depth:6}),'resizing into another lot');
  data.world.tiles[5*24+4].type='path';assert.ok(objectPlacementError(data,'house','a',{x:6,y:6}));
  data.world.tiles[5*24+4].type='grass';
  for(const type of ['tree','grass']){data.world.decorations=[{id:'new',type,x:4.2,y:5.1,size:1}];assert.ok(objectPlacementError(data,'house','a',{x:6,y:6}));}
});

test('house dimensions survive catalog roundtrips and reject invalid sizes or edge overflow',()=>{
  const data=structuredClone(original);data.workers[0].house={x:6,y:6,width:3,depth:2};
  validateCatalog(data);const restored=JSON.parse(JSON.stringify(data));validateCatalog(restored);
  assert.deepEqual(restored.workers[0].house,data.workers[0].house);
  for(const house of [{x:0,y:0},{x:2,y:2,width:4},...[0,-1,1.5,25,null,'2'].map(width=>({x:6,y:6,width})),{x:23,y:24},{x:6,y:6,depth:0}]){
    assert.equal(Boolean(validHouse(house)),false,JSON.stringify(house));
    restored.workers[0].house=house;assert.throws(()=>validateCatalog(restored));
  }
  assert.equal(validHouse({x:23,y:23,width:24,depth:24}),true);
  assert.equal(validHouse({x:0,y:0,width:1,depth:1}),true);
});
test('legacy scenery has stable editable defaults; moved scenery and painted terrain share the catalog',()=>{
  const data=structuredClone(original);delete data.world;
  const defaults=villageWorld(data);validateWorld(defaults);
  assert.deepEqual(villageWorld(data),defaults);assert.equal(defaults.tiles.length,576);
  data.world=structuredClone(defaults);data.world.sign={x:1,y:14};data.world.noticeboard={x:8,y:20};
  data.world.tiles[12*24+15].type='water';data.world.decorations.push({id:'tree-added',type:'tree',x:18,y:4,size:1});
  validateCatalog(data);
  const restored=JSON.parse(JSON.stringify(data)),scene=villageContent(restored,'ko','Induohood');
  assert.deepEqual(scene.places.find(o=>o.id==='welcome').x,1);
  assert.equal(scene.places.find(o=>o.id==='noticeboard').x,8);
  assert.equal(terrainAt(scene.world,15,12),'water');
  assert.ok(scene.world.decorations.some(d=>d.id==='tree-added'));
  assert.deepEqual(villageWorld(original),defaults,'editing must not mutate the fallback');
});
test('scenery tools reject unsafe coordinates, overlaps, occupied paint and excessive objects',()=>{
  const data=structuredClone(original);data.world=villageWorld(data);
  assert.ok(objectPlacementError(data,'tree','new',{x:10,y:10}));
  assert.ok(objectPlacementError(data,'tree','new',data.workers[0].house));
  assert.equal(objectPlacementError(data,'character','mascot',{x:10,y:10}),'');
  assert.ok(objectPlacementError(data,'character','mascot',{x:18,y:17}));
  assert.ok(objectPlacementError(data,'sign','welcome',{x:-1,y:3}));
  assert.ok(paintError(data,data.workers[0].house,'water'));
  assert.equal(paintError(data,{x:15,y:12},'path'),'');
  assert.equal(paintError(data,{x:10,y:10},'grass'),'');
  for(const change of [w=>w.tiles.pop(),w=>w.tiles[0].type='script',w=>w.sign.x=Infinity,w=>w.mascot.x=24,w=>w.decorations[0].size=100,w=>w.decorations.push(w.decorations[0]),w=>w.decorations=Array(MAX_DECORATIONS+1).fill(w.decorations[0])]){
    const invalid=structuredClone(data);change(invalid.world);assert.throws(()=>validateCatalog(invalid));
  }
});
test('jukebox links reach the corresponding music Work including the original loop',()=>{
  const data=structuredClone(original),scene=villageContent(data,'ko','Induohood');
  const jukebox=scene.places.find(p=>p.shape==='jukebox'),url=new URL(jukebox.links[0].href,'https://induo.works');
  const work=contentWorks(data,'ko').find(w=>w.id==='music:legacy');
  assert.equal(url.pathname,'/ko/work/');assert.equal(url.searchParams.get('q'),work.title);
  assert.equal(url.hash,'#work-info-'+work.id);assert.equal(jukebox.description,'');
});
test('an empty noticeboard stays draggable even though it has no public interaction button',async()=>{
  const source=await readFile(new URL('./editor/bridge.js',import.meta.url),'utf8');
  const board={id:'noticeboard',shape:'board',area:'village',interactive:false,x:9,y:20},center=toScreen(board.x,board.y);
  const context={objects:[board],toScreen,editorPoint:e=>e.point,event:{target:{closest:()=>null},point:toTile(center.x,center.y-50)}};
  runInNewContext(source.slice(source.indexOf('function editorHit('),source.indexOf('function editorSelect('))+'\nresult=editorHit(event);',context);
  assert.equal(context.result,board);
});
