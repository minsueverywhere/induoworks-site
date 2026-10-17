import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {villageWorld,validateWorld,terrainAt,MAX_DECORATIONS} from '../src/scripts/village-world.mjs';
import {objectPlacementError,paintError} from './editor-placement.mjs';
import {validateCatalog} from '../src/content-schema.mjs';
import {villageContent} from '../src/scripts/village-content.mjs';
import {contentWorks} from '../src/scripts/content-catalog.mjs';
import {runInNewContext} from 'node:vm';
import {toScreen,toTile} from '../src/scripts/village-camera.mjs';
const original=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8'));
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
