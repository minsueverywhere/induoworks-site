import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateCatalog} from '../src/content-schema.mjs';
import {villageContent} from '../src/scripts/village-content.mjs';
import {roomFloors,validateRoom,roomStack,roomElevation,roomScreen,roomPoint} from '../src/scripts/village-room.mjs';
import {clampCamera,panCamera,zoomCamera} from '../src/scripts/village-camera.mjs';
import {runInNewContext} from 'node:vm';
import {objectFootprint,groundPosition,setTerrain} from '../src/scripts/village-world.mjs';
import {roomCatalog,objectPlacementError,paintError,placementObjects} from './editor-placement.mjs';
import {createHistory} from './editor/history.mjs';
import {createTutorial} from '../src/scripts/village-tutorial.mjs';
const original=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8'));

test('stacking uses cumulative wall height, dims lower floors and excludes every upper floor',()=>{
  const worker={room:{floors:[90,140,60].map(wallHeight=>({wallHeight,tiles:[{x:0,y:0,type:'floor'}],exhibits:[]}))}};
  assert.deepEqual(roomStack(worker,1).map(({index,elevation,opacity})=>({index,elevation,opacity})),[{index:0,elevation:0,opacity:.22},{index:1,elevation:98,opacity:1}]);
  assert.equal(roomElevation(worker,2),246);
  assert.deepEqual(roomStack(worker,0).map(l=>l.index),[0]);
  worker.room.floors[0].wallHeight=130;
  assert.equal(roomElevation(worker,2),286,'editing the lower wall moves both upper floors');
  for(let level=0;level<3;level++)for(const point of [{x:0,y:0},{x:4,y:7},{x:-2,y:3}]){
    assert.deepEqual(roomPoint(roomScreen(point,worker,level),worker,level),point);
  }
});

test('raised floors keep camera panning and pointer-centred zoom on their own plane',()=>{
  const worker={room:{floors:[{wallHeight:140},{wallHeight:90}]}},bounds={minX:-3,maxX:12,minY:-3,maxY:12,elevation:roomElevation(worker,1)};
  const camera=roomScreen({x:4,y:4},worker,1);
  assert.deepEqual(clampCamera(camera,bounds),camera);
  const moved=panCamera(camera,-9999,-9999,1,bounds);
  assert.deepEqual(roomPoint(moved,worker,1),{x:12,y:12});
  const pointer={x:20,y:-10},zoom=zoomCamera(camera,1,1.4,pointer,pointer,bounds);
  assert.ok(Math.abs(zoom.camera.y+pointer.y/zoom.scale-camera.y-pointer.y)<1e-9);
});

test('actual upper-floor brush projection returns the selected tile despite elevation and zoom',async()=>{
  const source=await readFile(new URL('./editor/bridge.js',import.meta.url),'utf8');
  const worker={room:{floors:[{wallHeight:140},{wallHeight:90}]}},point={x:3,y:6},p=roomScreen(point,worker,1),camera={x:0,y:-120},scale=.8;
  const context={scene:{getBoundingClientRect:()=>({left:10,top:20})},width:700,height:500,camera,scale,area:'room',activeWorker:worker,roomLevel:1,roomPoint,
    event:{clientX:10+350+(p.x-camera.x)*scale,clientY:20+250+30+(p.y-camera.y)*scale}};
  const start=source.indexOf('const editorPoint='),end=source.indexOf('const editorId=');
  runInNewContext(source.slice(start,end)+'\nresult=editorPoint(event);',context);
  assert.ok(Math.abs(context.result.x-point.x)<1e-9&&Math.abs(context.result.y-point.y)<1e-9);
});

test('actual renderer paints each lower floor and its exhibits before the selected floor',async()=>{
  const source=await readFile(new URL('../src/scripts/village.js',import.meta.url),'utf8'),drawn=[];
  const ctx={globalAlpha:1,setTransform(){},clearRect(){},translate(){},scale(){},save(){},restore(){},drawImage(canvas){drawn.push([canvas,this.globalAlpha]);}};
  const objects=[0,1,2].map(floor=>({area:'room',owner:'a',floor,draw(c){drawn.push(['object'+floor,c.globalAlpha]);}}));
  const context={frame:0,width:600,height:600,camera:{x:0,y:0},scale:1,dpr:1,ctx,area:'room',activeWorker:{id:'a'},roomLevel:1,drawingRoomLevel:0,
    participantEditor:null,roomLayers:[{index:0,opacity:.22,canvas:'floor0',x:0,y:0},{index:1,opacity:1,canvas:'floor1',x:0,y:-98}],objects,
    objectScreen:()=>({x:0,y:0}),spriteBounds:()=>[0,0,100,100]};
  const start=source.indexOf('function draw()'),end=source.indexOf('  for (const p of places) {',start);
  runInNewContext(source.slice(start,end)+'}\ndraw();',context);
  assert.deepEqual(drawn,[['floor0',.22],['object0',.22],['floor1',1],['object1',1]]);
});

test('the removed hub stays in Workers, with its work and lazy jukebox displayed outdoors',()=>{
  validateCatalog(original);
  const scene=villageContent(original,'ko','');
  assert.ok(original.workers.find(w=>w.id==='induo-works'));
  assert.equal(scene.places.some(p=>p.shape==='house'&&p.id==='induo-works'),false);
  const music=scene.places.find(p=>p.id==='display:outdoor-jukebox');
  assert.equal(music.area,'village');assert.equal(music.music.title,original.music.title);
  assert.ok(music.links[0].href.includes('kind=music'));
  assert.equal(scene.places.find(p=>p.id==='display:site-display').title,original.projects.find(p=>p.slug==='induoworks-site').title.ko);
  const bad=structuredClone(original);bad.world.exhibits[0].ref='missing';assert.throws(()=>validateCatalog(bad),/reference/);
});

test('mirroring rotates a rectangular reserved footprint and preserves one ground center',()=>{
  const board={x:4,y:11,width:1,depth:3,flip:true};
  assert.deepEqual(objectFootprint(board,'board'),{x:2,y:11,width:3,depth:1});
  assert.deepEqual(groundPosition(board,'board'),{x:3,y:11});
  assert.equal(objectPlacementError(original,'board','noticeboard',board),'');
  const bad=structuredClone(original);bad.world.noticeboard.flip='yes';assert.throws(()=>validateCatalog(bad));
  assert.equal(original.world.noticeboard.size,.75);
});

test('three independent floors retain tile edits, height and referenced displays through undo and JSON',()=>{
  let data=structuredClone(original),worker=data.workers.find(w=>w.house);
  worker.room={floors:structuredClone(roomFloors(worker))};
  const history=createHistory();history.reset(data);history.begin();
  worker.room.floors.push({wallHeight:160,tiles:[{x:0,y:0,type:'floor'}],exhibits:[]});
  setTerrain(worker.room.floors[1],1,0,'floor');
  worker.room.floors[1].exhibits.push({id:'upstairs',kind:'music',ref:'legacy',x:1,y:0,width:1,depth:1});
  worker.room.floors.push({wallHeight:48,tiles:[{x:0,y:0,type:'floor'}],exhibits:[]});
  history.record(data);history.end(data);validateCatalog(data);
  const room=roomCatalog(data,worker.id,1);
  assert.equal(objectPlacementError(room,'exhibit','upstairs',{x:1,y:0}),'');
  assert.ok(paintError(room,{x:1,y:0},'empty'));assert.ok(paintError(room,{x:24,y:0},'floor'));
  const place=villageContent(data,'ko','').places.find(p=>p.worldId==='upstairs');
  assert.equal(place.floor,1);assert.equal(place.owner,worker.id);
  assert.equal(place.music.title,data.music.title);
  const restored=JSON.parse(JSON.stringify(data));validateCatalog(restored);
  assert.deepEqual(restored.workers.find(w=>w.id===worker.id).room,worker.room);
  data=history.undo(data);assert.equal(data.workers.find(w=>w.id===worker.id).room.floors.length,1);
  data=history.redo(data);assert.equal(data.workers.find(w=>w.id===worker.id).room.floors[1].wallHeight,160);
});

test('room limits and legacy displays are protected before saving',()=>{
  const worker=original.workers.find(w=>w.house),data=structuredClone(original),copy=data.workers.find(w=>w.id===worker.id);
  copy.room={floors:structuredClone(roomFloors(worker))};
  for(const change of [r=>r.floors=[],r=>r.floors=Array(4).fill(r.floors[0]),r=>r.floors[0].wallHeight=241,r=>r.floors[0].tiles.push(r.floors[0].tiles[0]),r=>r.floors[0].tiles[0].type='water']){
    const bad=structuredClone(copy.room);change(bad);assert.throws(()=>validateRoom(bad));
  }
  const scene=roomCatalog(data,worker.id,0),legacy=placementObjects(scene).find(o=>o.type==='roomItem');
  assert.ok(legacy);assert.ok(objectPlacementError(scene,'exhibit','new',legacy.point));
  assert.ok(paintError(scene,legacy.point,'empty'));
});

test('the outdoor tutorial can finish without entering or leaving a removed building',()=>{
  const shown=[],tutorial=createTutorial(step=>shown.push(step),['drag','zoom','music']);tutorial.start();
  tutorial.complete('drag');tutorial.complete('zoom');tutorial.complete('house');tutorial.complete('music');
  assert.deepEqual(shown,['drag','zoom','music','done']);tutorial.close();assert.equal(shown.at(-1),null);
});
