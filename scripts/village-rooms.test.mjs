import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateCatalog} from '../src/content-schema.mjs';
import {villageContent} from '../src/scripts/village-content.mjs';
import {roomFloors,validateRoom,roomStack,roomElevation,roomScreen,roomPoint} from '../src/scripts/village-room.mjs';
import {clampCamera,panCamera,zoomCamera} from '../src/scripts/village-camera.mjs';
import {runInNewContext} from 'node:vm';
import {objectFootprint,groundPosition,setTerrain,validateWorld,villageWorld} from '../src/scripts/village-world.mjs';
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


test('transparent tiles are retained as structural openings and cannot support displays',()=>{
  const data=structuredClone(original),worker=data.workers.find(w=>w.house);
  worker.room={floors:structuredClone(roomFloors(worker))};
  setTerrain(worker.room.floors[0],0,0,'transparent');validateRoom(worker.room);
  assert.equal(worker.room.floors[0].tiles.find(t=>t.x===0&&t.y===0).type,'transparent');
  assert.ok(objectPlacementError(roomCatalog(data,worker.id),'exhibit','new',{x:0,y:0,width:1,depth:1}));
  assert.equal(paintError(roomCatalog(data,worker.id),{x:0,y:0},'floor'),'');
});

test('transparent cells draw no tile or walls while suppressing a neighboring inner wall',async()=>{
 const source=await readFile(new URL('../src/scripts/village.js',import.meta.url),'utf8');
 const walls=[],tiles=[],floor={wallHeight:90,tiles:[{x:0,y:0,type:'transparent'},{x:1,y:0,type:'floor'}],exhibits:[]};
 const c={translate(){}};
 const context={activeWorker:{},roomLevel:0,roomStack:()=>[{floor,elevation:0}],terrainBounds:()=>({minX:0,maxX:1,minY:0,maxY:0}),toScreen:(x,y)=>({x:(x-y)*24,y:(x+y)*12}),terrainAt:(f,x,y)=>f.tiles.find(t=>t.x===x&&t.y===y)?.type,document:{createElement:()=>({getContext:()=>c})},polygon:(_c,_p,color)=>walls.push(color),tile:(_c,x,y)=>tiles.push([x,y])};
 runInNewContext(source.slice(source.indexOf('function makeRoom()'),source.indexOf('function setRoomLevel('))+'makeRoom();',context);
 assert.deepEqual(tiles,[[1,0]]);assert.equal(walls.filter(color=>color==='#e7d8ad').length,1);assert.equal(walls.includes('#d7c79e'),false);
});


test('host-selected house stages preserve placement and the existing style remains compatible',()=>{
 for(const style of ['tent','cabin','house']){
  const data=structuredClone(original),worker=data.workers.find(w=>w.house),before={...worker.house};worker.house.style=style;validateCatalog(data);
  const house=villageContent(data,'ko','').places.find(p=>p.id===worker.id);assert.equal(house.style,style);assert.equal(house.x,before.x);assert.equal(house.y,before.y);
 }
 const bad=structuredClone(original);bad.workers.find(w=>w.house).house.style='castle';assert.throws(()=>validateCatalog(bad));
});

test('house renderer distinguishes tent, cabin and home; LP deck stays a static cube',async()=>{
 const source=await readFile(new URL('../src/scripts/village.js',import.meta.url),'utf8');
 const calls=[],c=new Proxy({},{get:(_,key)=>(...args)=>calls.push([key,...args]),set:()=>true});
 const context={polygon:(_c,_p,color)=>calls.push(['polygon',color]),box:(_c,_x,_y,w,d,h)=>calls.push(['box',w,d,h]),facingText(){}};
 const house=runInNewContext(source.slice(source.indexOf('function house('),source.indexOf('function grass('))+'house;',context);
 for(const style of ['tent','cabin','house']){calls.length=0;house(c,{id:'worker',title:'Studio',style,storeys:1});assert.equal(calls.some(call=>call[0]==='box'),style!=='tent');if(style==='cabin')assert.ok(calls.some(call=>call[0]==='stroke'));}
 calls.length=0;const deck=runInNewContext(source.slice(source.indexOf('function jukebox('),source.indexOf('function artwork('))+'jukebox;',{...context,playing:false,sameMusic:()=>false,playingTrack:null});deck(c);
 assert.deepEqual(calls.find(call=>call[0]==='box'),['box',22,11,22]);assert.ok(calls.filter(call=>call[0]==='ellipse').length>=3);
 const scene=villageContent(original,'ko','');assert.equal(scene.places.find(p=>p.id==='display:outdoor-jukebox').height,48);
});

test('indoor objects sit on their tile center and multi-cell depth follows their footprint center',async()=>{
 const source=await readFile(new URL('../src/scripts/village.js',import.meta.url),'utf8');
 for(const [name,end] of [['game','jukebox'],['jukebox','artwork'],['artwork','makeRoom']]){
  let y=0,base;const c=new Proxy({translate:(_x,dy)=>{y+=dy;},fillRect:(_x,top,_w,h)=>{if(name==='artwork'&&h===24)base=y+top+h;}},{get:(target,key)=>target[key]||(()=>{}),set:()=>true});
  const draw=runInNewContext(source.slice(source.indexOf('function '+name+'('),source.indexOf('function '+end+'('))+name+';',{polygon(){},box:(_c,_x,top,_w,d)=>{base=y+top+d;},badges:new Map(),playing:false,sameMusic:()=>false,playingTrack:null});
  draw(c,{id:'object'});assert.equal(base,0,name+' base must be centered on the tile');
 }
 const depth=runInNewContext(source.slice(source.indexOf('function objectPoint('),source.indexOf('const decorationObject='))+'objectDepth;',{groundPosition});
 assert.equal(depth({area:'room',editType:'exhibit',x:4,y:4,ground:{x:3,y:3}}),6);
 assert.ok(depth({area:'room',editType:'exhibit',x:4,y:4,ground:{x:3,y:3}})<depth({area:'room',x:4,y:3}));
});

test('notebook titles survive renaming and new board identities remain distinct across floors',()=>{
 const data=structuredClone(original),worker=data.workers.find(w=>w.house);worker.room={floors:structuredClone(roomFloors(worker))};
 const f=worker.room.floors[0];f.exhibits.push({id:'notes',kind:'guestbook',ref:'guestbook',boardId:'notes',title:'음원 피드백',x:0,y:0,width:1,depth:1});validateRoom(worker.room);
 let note=villageContent(data,'ko','').places.find(p=>p.worldId==='notes');assert.equal(note.title,'음원 피드백');assert.equal(note.board,'notes');
 f.exhibits[0].title='새 제목';assert.equal(villageContent(data,'ko','').places.find(p=>p.worldId==='notes').board,'notes');
 const bad=structuredClone(worker.room);bad.floors[0].exhibits[0].title='x'.repeat(61);assert.throws(()=>validateRoom(bad));
 const duplicate=structuredClone(worker.room);duplicate.floors.push(structuredClone(duplicate.floors[0]));assert.throws(()=>validateRoom(duplicate));
});

test('LP stylus and indicator change only for the jukebox whose track is playing',async()=>{
 const source=await readFile(new URL('../src/scripts/village.js',import.meta.url),'utf8'),track={sources:{ogg:'/song.ogg'}},other={sources:{ogg:'/other.ogg'}},calls=[];
 const c=new Proxy({},{get:(_,key)=>(...args)=>calls.push([key,...args]),set:()=>true});
 const draw=runInNewContext(source.slice(source.indexOf('function jukebox('),source.indexOf('function artwork('))+'jukebox;',{box(){},playing:true,playingTrack:track,sameMusic:(a,b)=>JSON.stringify(a)===JSON.stringify(b)});
 draw(c,{music:track});assert.ok(calls.some(x=>x[0]==='lineTo'&&x[1]===2&&x[2]===-22));calls.length=0;
 draw(c,{music:other});assert.ok(calls.some(x=>x[0]==='lineTo'&&x[1]===17&&x[2]===-15));
});

test('stationery desk fits one tile and the two display panels stand along the isometric tile edge',async()=>{
 const source=await readFile(new URL('../src/scripts/village.js',import.meta.url),'utf8'),calls=[];
 const c=new Proxy({},{get:(_,key)=>(...args)=>calls.push([key,...args]),set:()=>true}),context={polygon(){},box:(_c,x,y,w,d,h)=>calls.push(['box',x,y,w,d,h]),badges:new Map()};
 const draw=runInNewContext(source.slice(source.indexOf('function guestbook('),source.indexOf('function spriteBounds('))+'guestbook;',context);draw(c);
 assert.ok(calls.some(call=>call[0]==='lineTo'&&call[1]===0&&call[2]===9));assert.ok(calls.some(call=>call[0]==='box'&&call[3]===22&&call[4]===11));
 for(const [name,end]of [['game','jukebox'],['artwork','makeRoom']]){calls.length=0;const draw=runInNewContext(source.slice(source.indexOf('function '+name+'('),source.indexOf('function '+end+'('))+name+';',context);draw(c,{id:'art'});assert.ok(calls.some(call=>call[0]==='transform'&&call[1]===1&&call[2]===.5));assert.ok(calls.some(call=>call[0]==='box'&&call[3]<=24&&call[4]<=12));}
});


test('small editable signs are valid in both legacy and compact villages and reject oversized text',()=>{
 for(const world of [structuredClone(original.world),villageWorld({workers:[]})]){
  world.decorations.push({id:'feedback-sign',type:'sign',x:1,y:1,width:1,depth:1,size:1,title:'Welcome'});validateWorld(world);
  const bad=structuredClone(world);bad.decorations.at(-1).title='x'.repeat(41);assert.throws(()=>validateWorld(bad));
 }
});
