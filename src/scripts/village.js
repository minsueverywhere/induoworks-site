import {studioSlice,mergeStudio} from '../server/studio-content.mjs';
import {villageSky} from './village-sky.mjs';
import {onPage} from './page-lifecycle.mjs';
import {siteMusic,sameMusic} from './site-music.mjs';
import {createSceneView} from './village-view.mjs';
import { terrainAt, terrainBounds, groundPosition, worldLetters } from './village-world.mjs';
import { musicArtist } from './village-tracks.mjs';
import { MIN_ZOOM, MAX_ZOOM, toScreen, clampCamera, panCamera, clampZoom, defaultZoom, snapZoom, isDrag, zoomCamera, pinchPoints } from './village-camera.mjs';
import { landscapeNoise as noise } from './village-layout.mjs';
import { createTutorial, contextTutorialSteps } from './village-tutorial.mjs';
import { musicTime } from './village-music.mjs';
import { popupPosition } from './village-popup.mjs';
import {mountExternal} from './external-player.mjs';
import { loadContent } from './content-loader.mjs';
import { villageContent } from './village-content.mjs';
import {roomFloors,roomStack,roomElevation,roomScreen,roomPoint} from './village-room.mjs';
onPage('village-section',async(root,life)=>{
const remoteContent=await loadContent();
if(!life.alive())return;
if(remoteContent) {
  const lang=document.documentElement.lang.startsWith('ko')?'ko':'en';
  const data=villageContent(remoteContent,lang,JSON.parse(root.dataset.text).title);
  for(const key of ['places','workers','media','music','world'])root.dataset[key]=JSON.stringify(data[key]);
  const copy=JSON.parse(root.dataset.text);copy.music=data.music.title+' · '+data.music.project;root.dataset.text=JSON.stringify(copy);
  const container=root.querySelector('.village-places'),sample=container.querySelector('button');
  container.replaceChildren(...data.places.filter(p=>p.interactive!==false).map(p=>{
    const button=sample.cloneNode(true);button.dataset.object=p.id;button.dataset.area=p.area;
    if(p.owner)button.dataset.owner=p.owner;else delete button.dataset.owner;
    button.hidden=p.area==='room';button.setAttribute('aria-label',p.label);button.querySelector('span').textContent=p.label;
    return button;
  }));
  root.dataset.contentSource='remote';
} else root.dataset.contentSource='embedded';
const initialBounds=terrainBounds(JSON.parse(root.dataset.world));
const villageCenter=toScreen((initialBounds.minX+initialBounds.maxX)/2,(initialBounds.minY+initialBounds.maxY)/2);
const $ = id => document.getElementById('village-' + id);
const workers = JSON.parse(root.dataset.workers);
let activeWorker = null;
const sceneWorld=JSON.parse(root.dataset.world);
const isPath=(x,y)=>terrainAt(sceneWorld,x,y)==='path';
const places = JSON.parse(root.dataset.places), text = JSON.parse(root.dataset.text), media = JSON.parse(root.dataset.media);
const badges = new Map(), sprites = new Map();
let area = 'village', savedVillage = null, roomLevel=0;
const currentRoom=()=>roomFloors(activeWorker)[roomLevel];
let roomLayers=[];
let participantEditor=null;
function worldSize() { return area === 'room' ? {...terrainBounds(currentRoom(),3),elevation:roomElevation(activeWorker,roomLevel)} : terrainBounds(sceneWorld,root.dataset.editor==='true'?3:1); }
let hovered = '';
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const popup = $('popup');
const zoomRange = $('zoom-range');
const wallLinks = [...$('social').querySelectorAll('a')];
let zoomPointer = false;let zoomLabelTimer;
function showZoomLabel(){const hud=zoomRange.closest('.village-hud');hud.dataset.adjusting='true';clearTimeout(zoomLabelTimer);zoomLabelTimer=setTimeout(()=>{hud.dataset.adjusting='false';},900);}
let popupTrigger = null;
let popupObject = null, tutorialStep = null;
let clearExternal;
const scene = $('scene'), terrain = document.createElement('canvas'), ground = terrain.getContext('2d');
function updateSky(){const sky=villageSky();scene.style.setProperty('--sky-background',sky.background);scene.style.setProperty('--sky-stars',String(sky.stars));scene.style.setProperty('--sky-ink',sky.ink);}
scene.dataset.area='village';updateSky();
const skyTimer=setInterval(()=>{if(!document.hidden)updateSky();},300000);
life.on(document,'visibilitychange',()=>{if(!document.hidden)updateSky();});life.cleanup(()=>clearInterval(skyTimer));

const help = $('help'), helpToggle = $('help-toggle'), guide = $('hint');
function showGuide(open) { guide.hidden=!open; }
helpToggle.addEventListener('click',async()=>{
  const identity=await identityReady;
  if(!life.alive())return;
  closePopup();
  tutorialExhibit=places.find(p=>p.area===area&&(area!=='room'||p.owner===activeWorker?.id&&(p.floor||0)===roomLevel)&&p.interactive!==false&&p.shape!=='house');
  tutorialSteps=contextTutorialSteps(area,Boolean(identity?.owners?.includes(activeWorker?.id)),{house:Boolean(tutorialHouse),music:tutorialJukebox?.area==='village',exhibit:Boolean(tutorialExhibit)});
  showGuide(false); tutorial.start(tutorialSteps); requestDraw(); canvas.focus({preventScroll:true});
  scene.scrollIntoView({block:'nearest',behavior:'instant'});
});
help.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')showGuide(true);});
help.addEventListener('pointerleave',()=>showGuide(false));
helpToggle.addEventListener('focus',()=>showGuide(true));
help.addEventListener('focusout',()=>showGuide(false));
life.on(document,'click',event=>{if(!help.contains(event.target))showGuide(false);});
life.on(document,'keydown',event=>{if(event.key==='Escape') {showGuide(false);tutorial.close();}});
const buttons = new Map([...root.querySelectorAll('[data-object]')].map(b => [b.dataset.object, b]));
let width = 0, height = 0, dpr = 1, scale = 1, camera = {...villageCenter}, frame = 0;
const tutorialPanel = $('tutorial'), tutorialSkip = $('tutorial-skip');
const tutorialHouse = places.find(p=>p.id==='induo-works'&&p.shape==='house')||places.find(p=>p.shape==='house');
const tutorialJukebox = places.find(p=>p.area==='village'&&p.shape==='jukebox')||places.find(p=>p.owner===tutorialHouse?.id&&p.shape==='jukebox');
let tutorialSteps=[],tutorialExhibit;
const tutorial = createTutorial(step=>{
  tutorialStep=step;
  tutorialPanel.hidden=!step;
  $('tutorial-spotlight').hidden=!step;
  $('tutorial-gesture').hidden=!step;
  helpToggle.setAttribute('aria-expanded',String(Boolean(step)));
  buttons.forEach(b=>b.classList.remove('tutorial-target'));
  $('back').classList.remove('tutorial-target');$('studio').classList.remove('tutorial-target');
  if(!step)return;
  const touch=matchMedia('(pointer: coarse)').matches;
  const gestureIcon=$('tutorial-gesture');
  gestureIcon.dataset.step=step;
  gestureIcon.hidden=step==='done';
  $('tutorial-progress').textContent=step==='done'?'✓':(tutorialSteps.indexOf(step)+1)+' / '+tutorialSteps.length;
  $('tutorial-message').textContent=text.tutorial[step==='zoom'?(touch?'pinch':'wheel'):step==='drag'&&area==='room'?'roomDrag':step];
  tutorialSkip.textContent=step==='done'?text.tutorial.finish:text.tutorial.skip;
  const target=step==='house'?tutorialHouse:step==='music'?tutorialJukebox:step==='work'?tutorialExhibit:null;
  if(target) {
    camera=objectScreen(target);
    buttons.get(target.id)?.classList.add('tutorial-target');
  }
  if(step==='edit')$('studio').classList.add('tutorial-target');
  if(step==='exit'){$('back').classList.add('tutorial-target');$('back').focus({preventScroll:true});}
  requestDraw();
},tutorialSteps);
tutorialSkip.addEventListener('click',()=>{tutorial.close();canvas.focus({preventScroll:true});});
let playing=false,currentTrack;
function syncMusic(data){
  playing=data.state==='playing';sprites.clear();
  const selected=sameMusic(currentTrack,data.track),current=selected?data.current:0,duration=selected?data.duration:currentTrack?.duration||0;
  $('seek').disabled=!selected||!duration;$('seek').max=String(duration||1);$('seek').value=String(current);
  $('seek').setAttribute('aria-valuetext',musicTime(current)+' / '+musicTime(duration));$('time').textContent=musicTime(current)+' / '+musicTime(duration);
  const active=selected&&playing;$('music').dataset.loading=String(selected&&data.state==='loading');$('music').setAttribute('aria-label',active?text.pause:text.play);$('music').setAttribute('aria-pressed',String(active));
  if(active)tutorial.complete('music');requestDraw();
}
function selectMusic(track){currentTrack=track;text.music=track.title+' - '+musicArtist(track);syncMusic(siteMusic.snapshot());}
const music={toggle:()=>siteMusic.toggle(currentTrack),stop:()=>siteMusic.pause(),seek:value=>{if(sameMusic(currentTrack,siteMusic.snapshot().track))siteMusic.seek(value);}};
selectMusic(JSON.parse(root.dataset.music));
const unsubscribeMusic=siteMusic.subscribe(syncMusic);
function objectPoint(o){return o.area==='village'||o.editType==='exhibit'?(o.ground||groundPosition(o,o.shape||o.type)):o;}
function objectScreen(o){const p=objectPoint(o);return o.area==='room'?roomScreen(p,activeWorker,o.floor||0):toScreen(p.x,p.y);}
const decorationObject=d=>({...d,ground:groundPosition(d,d.type),worldId:d.legacy?undefined:d.id,id:undefined,interactive:false,area:'village',draw:d.type==='tree'?tree:d.type==='letter'?letter:grass});
const objects = [...[...sceneWorld.decorations,...(sceneWorld.layoutVersion===2?[]:worldLetters(sceneWorld))].map(decorationObject), ...places.map(p => ({...p, draw: {house, board, game, jukebox, artwork}[p.shape]})), {...sceneWorld.mascot,worldId:'mascot',type:'character',draw:character,area:'village'}].sort((a,b)=>a.x+a.y-b.x-b.y);
function polygon(c, points, fill) { c.fillStyle = fill; c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fill(); }
function tile(c, x, y, color) { const p = toScreen(x,y); polygon(c, [[p.x,p.y-12],[p.x+24,p.y],[p.x,p.y+12],[p.x-24,p.y]], color); }
function box(c,x,y,w,d,h,colors) { polygon(c,[[x,y-h],[x+w,y+d-h],[x,y+2*d-h],[x-w,y+d-h]],colors[0]); polygon(c,[[x-w,y+d-h],[x,y+2*d-h],[x,y+2*d],[x-w,y+d]],colors[1]); polygon(c,[[x,y+2*d-h],[x+w,y+d-h],[x+w,y+d],[x,y+2*d]],colors[2]); }
let terrainOffset={x:0,y:0};
function makeGround() {
  const b=terrainBounds(sceneWorld),left=toScreen(b.minX,b.maxY).x-24,top=toScreen(b.minX,b.minY).y-12;
  terrainOffset={x:left,y:top};
  terrain.width=toScreen(b.maxX,b.minY).x+24-left+1;terrain.height=toScreen(b.maxX,b.maxY).y+20-top;
  ground.translate(-left,-top);
  for(const {x,y,type} of [...sceneWorld.tiles].sort((a,b)=>a.x+a.y-b.x-b.y)){
    const water=type==='water',path=type==='path',p=toScreen(x,y);
    polygon(ground,[[p.x-24,p.y],[p.x,p.y+12],[p.x+24,p.y],[p.x+24,p.y+6],[p.x,p.y+18],[p.x-24,p.y+6]],'#899469');
    tile(ground,x,y,water?((x+y)%2?'#82aca3':'#8db6ad'):path?'#e3c793':['#a6b77c','#a9b980','#acbc83'][Math.floor(noise(x,y)*3)]);
    if(path){
      const corners=[[p.x,p.y-12],[p.x+24,p.y],[p.x,p.y+12],[p.x-24,p.y]],neighbors=[[x,y-1],[x+1,y],[x,y+1],[x-1,y]];
      ground.strokeStyle='#aa8454';ground.lineWidth=1.5;ground.beginPath();neighbors.forEach(([nx,ny],i)=>{if(!isPath(nx,ny)){ground.moveTo(...corners[i]);ground.lineTo(...corners[(i+1)%4]);}});ground.stroke();
    }
    if(water){ground.fillStyle='#b7d2bf';ground.fillRect(p.x-8,p.y,14,1);}
  }
}
function house(c, object){
  c.translate(0,-3);
  const lift=((object.storeys||1)-1)*26;
  box(c,0,-18,43,21,50+lift,['#e8d3a1','#ddc18c','#bea877']);
  const roof=object.id==='induo-works'?['#456c92','#6088ac','#234567']:['#ad6245','#ca7b51','#98563d'];
  c.save();c.translate(0,-lift);
  polygon(c,[[-43,-47],[0,-72],[43,-47],[0,-25]],roof[0]);polygon(c,[[-43,-47],[-43,-56],[0,-85],[0,-72]],roof[1]);polygon(c,[[0,-85],[43,-56],[43,-47],[0,-72]],roof[2]);
  box(c,14,-69,5,3,16,['#d0b392','#ac8e76','#866d5d']);c.restore();
  for(let i=1;i<(object.storeys||1);i++){c.save();c.transform(1,21/43,0,1,-35,-43-i*26);c.fillStyle='#74999d';c.fillRect(4,0,13,13);c.restore();}
  // The door follows the right wall's isometric face.
  c.save(); c.transform(1,-21/43,0,1,0,-26);
  c.fillStyle='#705a3b';c.fillRect(12,19,15,31);c.fillStyle='#ead0a1';c.fillRect(15,35,2,2);c.restore();
  c.save();c.transform(1,21/43,0,1,-39,-36);
  c.fillStyle='#8d6543';c.fillRect(0,0,36,15);
  c.fillStyle='#c59c68';c.fillRect(1,1,34,13);
  c.fillStyle='#ae8657';c.fillRect(2,7,32,1);
  c.fillStyle='#59482f';c.font='600 6px system-ui, sans-serif';c.textAlign='center';facingText(c,object,object.title,18,10,30);c.restore();
}

function grass(c,o){c.save();c.scale(o.size,o.size);c.strokeStyle='#80965d';c.lineWidth=1.5;c.beginPath();c.moveTo(-2,0);c.lineTo(-3,-3);c.moveTo(0,0);c.lineTo(0,-4);c.moveTo(2,0);c.lineTo(3,-2);c.stroke();if(o.flower){c.fillStyle='#efe2b0';c.fillRect(-1,-5,2.5,2);}c.restore();}
function tree(c,object){c.save();c.scale(object.size,object.size);c.translate(0,-6);c.fillStyle='#7c7050';c.fillRect(-3,-13,6,19);polygon(c,[[-20,-12],[0,-51],[20,-12]],'#587b59');polygon(c,[[-16,-25],[0,-63],[16,-25]],'#719366');polygon(c,[[-11,-41],[0,-71],[11,-41]],'#8da773');c.restore();}
function letter(c,object){
  c.save();c.scale(object.size||1,object.size||1);c.transform(1,-.5,0,1,0,0);c.font='700 26px system-ui, sans-serif';c.textAlign='center';
  c.fillStyle='#7c7050';c.fillRect(-1,-6,2,6);
  c.fillStyle='#6c6a59';for(let d=3;d>0;d--)facingText(c,object,object.char,-d,-5-d);
  c.fillStyle=object.color;facingText(c,object,object.char,0,-5);c.restore();
}
function facingText(c,o,value,x,y,max){c.save();c.translate(x,y);c.scale(o.flip?-1:1,1);if(max)c.fillText(value,0,0,max);else c.fillText(value,0,0);c.restore();}
function board(c,object) {
  c.scale(object.size||1,object.size||1);c.translate(0,-9);
  polygon(c,[[-48,-44],[48,-92],[43,-94.5],[-53,-46.5]],'#c7aa7b');
  polygon(c,[[-48,-44],[-48,14],[-53,11.5],[-53,-46.5]],'#765437');
  c.save();c.transform(1,-.5,0,1,-48,-44);
  c.fillStyle='#705c40';c.fillRect(8,54,5,23);c.fillRect(84,54,5,23);
  c.fillStyle='#8c6543';c.fillRect(0,0,96,58);c.fillStyle='#b88c5b';c.fillRect(4,4,88,50);
  const papers=object.notes===1?[[24,8,48,42,'#f5e8c3']]:[[9,10,23,27,'#f5e8c3'],[37,8,20,21,'#d6dfbd'],[63,13,24,30,'#efe0b4'],[35,33,23,17,'#e1c6a0']];
  for (const [x,y,w,h,color] of papers.slice(0,object.notes||0)) {
    c.fillStyle=color;c.fillRect(x,y,w,h);c.fillStyle='#a25844';c.fillRect(x+w/2,y+2,2,2);c.fillStyle='#999476';c.fillRect(x+4,y+8,w-8,1);c.fillRect(x+4,y+12,w-10,1);
  }
  if(object.notes===1){c.fillStyle='#4c533b';c.font='700 8px system-ui, sans-serif';c.textAlign='center';facingText(c,object,object.noteTitle,48,31,40);}
  c.fillStyle='#725237';c.fillRect(-3,-4,102,7);c.restore();
}
function game(c,object) {
  box(c,0,-4,28,14,8,['#b58f62','#8a684c','#71543d']);
  c.fillStyle='#765b43';c.fillRect(-26,-67,52,54);c.fillStyle=['#465c68','#63775b','#826d80'][object.id.length%3];c.fillRect(-22,-63,44,46);
  c.fillStyle='#e8d8a3';c.fillRect(-13,-50,26,3);c.fillRect(-8,-43,16,3);c.fillStyle='#b6c59e';c.fillRect(-15,-32,30,7);
}
function jukebox(c) {
  box(c,0,-5,20,10,50,['#efbc70','#b47749','#8d5940']);c.fillStyle='#d9ad5d';c.beginPath();c.arc(0,-50,20,Math.PI,0);c.fill();c.fillStyle='#3e665d';c.fillRect(-13,-49,26,34);c.fillStyle=playing?'#e6cf7d':'#b2c8a4';c.fillRect(-9,-45,18,13);c.fillStyle='#d5b57a';for(let i=0;i<3;i++)c.fillRect(-9,-26+i*4,18,2);
}
function artwork(c,object) {
  c.fillStyle='#856747';c.fillRect(-26,-76,52,60);c.fillRect(-20,-17,4,24);c.fillRect(16,-17,4,24);c.fillStyle='#f8edcc';c.fillRect(-22,-72,44,52);
  const badge=badges.get(object.badge);if(badge?.complete&&badge.naturalWidth)c.drawImage(badge,-21,-63,42,32);
}
function makeRoom() {
  roomLayers=roomStack(activeWorker,roomLevel).map(layer=>{
  const {floor,elevation}=layer,b=terrainBounds(floor),h=floor.wallHeight,left=toScreen(b.minX,b.maxY).x-25,top=toScreen(b.minX,b.minY).y-12-h;
  const canvas=document.createElement('canvas');canvas.width=toScreen(b.maxX,b.minY).x+26-left;canvas.height=toScreen(b.maxX,b.maxY).y+22-top;
  const c=canvas.getContext('2d');c.translate(-left,-top);
  for(const {x,y}of floor.tiles){const p=toScreen(x,y);
    if(!terrainAt(floor,x,y-1))polygon(c,[[p.x,p.y-12-h],[p.x+24,p.y-h],[p.x+24,p.y],[p.x,p.y-12]],'#e7d8ad');
    if(!terrainAt(floor,x-1,y))polygon(c,[[p.x-24,p.y-h],[p.x,p.y-12-h],[p.x,p.y-12],[p.x-24,p.y]],'#d7c79e');
  }
  for(const {x,y}of [...floor.tiles].sort((a,b)=>a.x+a.y-b.x-b.y)){const p=toScreen(x,y);polygon(c,[[p.x-24,p.y],[p.x,p.y+12],[p.x+24,p.y],[p.x+24,p.y+8],[p.x,p.y+20],[p.x-24,p.y+8]],'#9b805d');tile(c,x,y,(x+y)%2?'#bf9c6d':'#caa978');}
  return {...layer,canvas,x:left,y:top-elevation};
  });
}
function setRoomLevel(level){
  roomLevel=Math.max(0,Math.min(roomFloors(activeWorker).length-1,level));closePopup();hovered='';makeRoom();
  const b=terrainBounds(currentRoom());camera=roomScreen({x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2},activeWorker,roomLevel);sprites.clear();updateFloors();requestDraw();participantEditor?.areaChanged();
}
function updateFloors(){
  const bar=$('floors');bar.hidden=area!=='room'||roomFloors(activeWorker).length<2;bar.replaceChildren();
  roomFloors(activeWorker).forEach((_,i)=>{const b=document.createElement('button');b.type='button';b.textContent=(i+1)+(document.documentElement.lang.startsWith('ko')?'층':'F');b.setAttribute('aria-pressed',String(i===roomLevel));b.addEventListener('click',()=>setRoomLevel(i));bar.append(b);});
}

function character(c){
  c.fillStyle='#425d3a35';c.beginPath();c.ellipse(0,3,10,4,0,0,Math.PI*2);c.fill();
  c.fillStyle='#e6ca89';c.fillRect(-7,-16,14,15);c.fillStyle='#e9d69b';c.fillRect(-9,-27,18,15);c.fillStyle='#ba8b57';c.fillRect(-11,-25,4,10);c.fillRect(7,-25,4,10);c.fillStyle='#314950';c.fillRect(-5,-23,2,2);c.fillRect(3,-23,2,2);c.fillRect(-2,-19,4,3);c.fillStyle='#476879';c.fillRect(-7,-12,14,4);c.fillStyle='#b58d4c';c.fillRect(-8,-29,16,3);c.fillStyle='#acbeac';c.fillRect(-6,-30,4,4);c.fillRect(2,-30,4,4);
}
function spriteBounds(object) {const extra=object.shape==='house'?((object.storeys||1)-1)*26:0;return [-64,-112-extra,128,144+extra];}
function sprite(object, hover) {
  const key = object.id+':'+hover;
  if (sprites.has(key)) return sprites.get(key);
  const [left,top,w,h]=spriteBounds(object);
  const art = document.createElement('canvas');art.width=w*2;art.height=h*2;
  const c = art.getContext('2d');c.scale(2,2);c.translate(-left,-top);c.scale(object.flip?-1:1,1);object.draw(c,object);
  if(object.interactive===false){sprites.set(key,art);return art;}
  const mask = document.createElement('canvas');mask.width=art.width;mask.height=art.height;
  const m = mask.getContext('2d');m.drawImage(art,0,0);m.globalCompositeOperation='source-in';m.fillStyle=hover?'#edcba9':'#725d3c';m.fillRect(0,0,art.width,art.height);
  const result = document.createElement('canvas');result.width=art.width;result.height=art.height;
  const r = result.getContext('2d');
  const edge=hover?6:2;
  for (const [x,y] of [[-edge,0],[edge,0],[0,-edge],[0,edge],[-edge/2,-edge/2],[edge/2,-edge/2],[-edge/2,edge/2],[edge/2,edge/2]]) r.drawImage(mask,x,y);
  r.drawImage(art,0,0);sprites.set(key,result);return result;
}
function requestBadge(object) {
  if (!object.badge || badges.has(object.badge)) return;
  const image = new Image();badges.set(object.badge,image);
  image.onload = () => {sprites.delete(object.id+':false');sprites.delete(object.id+':true');requestDraw();};
  image.onerror = () => {image.onload=null;};image.src=object.badge;
}
function requestDraw() { if (!life.alive())return;if (!frame) frame = requestAnimationFrame(draw); }
function draw() {
  frame = 0;
  const ox = width / 2 - camera.x * scale, oy = height / 2 - camera.y * scale + 30;
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,width,height);
  ctx.translate(ox,oy); ctx.scale(scale,scale);
  for(const layer of area==='room'?roomLayers:[{index:0,opacity:1,canvas:terrain,...terrainOffset}]){
  ctx.globalAlpha=layer.opacity;ctx.drawImage(layer.canvas,layer.x,layer.y);
  participantEditor?.draw(layer.index);
  for (const object of objects) {
    if(object.area!==area||(area==='room'&&(object.owner!==activeWorker?.id||(object.floor||0)!==layer.index)))continue;
    const p = objectScreen(object), x = ox + p.x*scale, y = oy + p.y*scale;
    const bounds=spriteBounds(object),[left,top,w,h]=bounds;
    if (x+(left+w)*scale<0 || x+left*scale>width || y+(top+h)*scale<0 || y+top*scale>height) continue;
    ctx.save(); ctx.translate(p.x,p.y);
    if (object.id) { requestBadge(object);ctx.drawImage(sprite(object,hovered===object.id),...bounds); }
    else {ctx.scale(object.flip?-1:1,1);object.draw(ctx,object);}
    ctx.restore();
  }
  }
  ctx.globalAlpha=1;
  for (const p of places) {
    const point = objectScreen(p), b = buttons.get(p.id);if(!b)continue;
    if(p.area!==area||(area==='room'&&(p.owner!==activeWorker?.id||(p.floor||0)!==roomLevel))){b.hidden=true;continue;}
    const x = ox + point.x*scale, y = oy + (point.y+12)*scale;
    const w = Math.max(44,p.width*scale), h = Math.max(44,p.height*scale);
    b.hidden = x < -w/2 || x > width+w/2 || y < 0 || y-h > height;
    b.style.left = x+'px'; b.style.top = y+'px'; b.style.width = w+'px'; b.style.height = h+'px';
  }
  $('zoom').textContent=Math.round(scale*100)+'%';
  zoomRange.value=String(Math.round(scale*100));
  zoomRange.setAttribute('aria-valuetext',Math.round(scale*100)+'%');
  zoomRange.style.setProperty('--zoom-progress',((scale-MIN_ZOOM)/(MAX_ZOOM-MIN_ZOOM)*100)+'%');
  scene.dataset.area=area;
  scene.dataset.camera = camera.x.toFixed(1)+','+camera.y.toFixed(1);
  scene.dataset.zoom = scale.toFixed(3);
  scene.dataset.hover = hovered;
  scene.dataset.floor=String(roomLevel+1);
  positionWallLinks(ox,oy);
  positionPopup(); positionTutorial();
}
function positionWallLinks(ox,oy) {
  $('social').hidden=area!=='room'||activeWorker?.id!=='induo-works'||roomLevel!==0;
  if($('social').hidden)return;
  wallLinks.forEach((a,i)=>{
    const slope=i<4?-.5:.5,x=i<4?-220+i*56:8+(i-4)*56,y=slope*x-82;
    a.style.left=(ox+x*scale)+'px';a.style.top=(oy+y*scale)+'px';
    a.style.transform=`matrix(${scale},${slope*scale},0,${scale},0,0)`;
  });
}
function positionPopup() {
  if(popup.hidden||!popupObject)return;
  const target=buttons.get(popupObject), r=scene.getBoundingClientRect(), b=target.getBoundingClientRect();
  const anchor={x:b.left-r.left,y:b.top-r.top,width:b.width,height:b.height},top=area==='room'?64:12;
  const space=Math.max(anchor.y-top-14,height-12-anchor.y-anchor.height-14);
  popup.style.maxHeight=Math.max(100,Math.min(330,height-100,popup.dataset.music==='true'?height-top-12:space))+'px';
  const p=popupPosition(anchor,{width:popup.offsetWidth,height:popup.offsetHeight},{width,height,top});
  popup.style.left=p.x+'px';popup.style.top=p.y+'px';popup.dataset.side=p.side;
}
function positionTutorial() {
  if(!tutorialStep)return;
  const r=scene.getBoundingClientRect();
  let focus=r;
  if(tutorialStep==='house'||tutorialStep==='music')focus=buttons.get(tutorialStep==='house'?tutorialHouse.id:tutorialJukebox.id).getBoundingClientRect();
  if(tutorialStep==='work')focus=buttons.get(tutorialExhibit.id).getBoundingClientRect();
  if(tutorialStep==='edit')focus=$('studio').getBoundingClientRect();
  if(tutorialStep==='exit')focus=$('back').getBoundingClientRect();
  const spotlight=$('tutorial-spotlight'), icon=$('tutorial-gesture');
  spotlight.style.left=(focus.left-6)+'px';spotlight.style.top=(focus.top-6)+'px';
  spotlight.style.width=(focus.width+12)+'px';spotlight.style.height=(focus.height+12)+'px';
  const focused=['house','music','work','edit','exit'].includes(tutorialStep);
  icon.style.left=(focused?focus.left-r.left+focus.width/2:r.width/2)+'px';
  icon.style.top=(focused?focus.top-r.top-22:r.height*.58)+'px';
}
life.on(window,'scroll',positionTutorial,{passive:true});
life.on(window,'resize',positionTutorial);
life.observe(popup,positionPopup);
function resize() {
  const r = canvas.getBoundingClientRect();
  if (!width) scale = defaultZoom(r.width,r.height,area);
  width = r.width; height = r.height; dpr = Math.min(devicePixelRatio || 1,1.5);
  canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr); requestDraw();
}
function changeArea(next) {
  if(next===area)return;
  if(next==='room') {savedVillage={camera:{...camera},scale};roomLevel=0;const b=terrainBounds(currentRoom());camera=roomScreen({x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2},activeWorker,roomLevel);scale=defaultZoom(width,height,'room');makeRoom();}
  else {camera=savedVillage?.camera||{...villageCenter};scale=savedVillage?.scale||defaultZoom(width,height);}
  area=next;scene.dataset.area=next;updateFloors();hovered='';closePopup();participantEditor?.areaChanged();
  if(next==='room'&&activeWorker.id==='induo-works')wallLinks.forEach(a=>{const image=a.querySelector('img');if(!image.hasAttribute('src'))image.src=image.dataset.src;});
  $('back').hidden=area!=='room';$('home').hidden=area==='room';$('caption').textContent=area==='room'?activeWorker.name.toUpperCase():text.title.toUpperCase();
  canvas.setAttribute('aria-label',area==='room'?activeWorker.name+' · '+text.room:text.title);
  pointers.clear();gesture=null;pinch=null;requestDraw();canvas.focus({preventScroll:true});
  if(matchMedia('(max-width: 639px)').matches)scene.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
$('back').addEventListener('click',()=>{
  if(tutorialStep==='music')tutorial.close();
  changeArea('village');tutorial.complete('exit');
});
function closePopup(restoreFocus = false) {
  clearExternal?.();clearExternal=null;
  popup.hidden = true;
  popupObject=null;
  buttons.forEach(b => b.setAttribute('aria-pressed','false'));
  if (restoreFocus && popupTrigger) popupTrigger.focus({preventScroll:true});
}
function visit(id, focusMap = false, trigger = null) {
  const p = places.find(p => p.id === id); if (!p) return;
  if(tutorialStep==='drag'||tutorialStep==='zoom'||(tutorialStep==='house'&&id!==tutorialHouse.id)||(tutorialStep==='music'&&id!==tutorialJukebox.id))return;
  if(tutorialStep==='work'&&id!==tutorialExhibit.id)return;
  if(tutorialStep==='work')tutorial.complete('work');
  if(p.shape==='house'){activeWorker=workers.find(w=>w.id===id);changeArea('room');void refreshPublicRoom(id);tutorial.complete('house');return;}
  if(!popup.hidden&&popupObject===id){closePopup(Boolean(trigger));return;}
  clearExternal?.();clearExternal=null;
  if(p.externalUrl)music.stop();
  if(p.shape==='jukebox')selectMusic(p.music||JSON.parse(root.dataset.music));
  popupObject=id;
  popupTrigger = trigger || buttons.get(id);
  popup.dataset.music=String(p.shape==='jukebox');
  $('title').textContent=p.shape==='jukebox'?text.music:p.title;
  $('description').textContent=p.description;$('description').hidden=p.shape==='jukebox';
  $('links').replaceChildren();
  for (const item of p.links || []) {
    const a = document.createElement('a'); a.href = item.href;
    const titleLink=p.shape==='jukebox'||p.shape==='game';
    if(titleLink){
      a.setAttribute('aria-label',item.title);a.title=item.title;
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
      path.setAttribute('d','M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7');svg.append(path);a.append(svg);
    }else a.textContent=item.title+' ↗';
    if(new URL(a.href).origin!==location.origin){a.target='_blank';a.rel='noopener noreferrer';}
    (titleLink?$('title'):$('links')).append(a);
  }
  $('player').hidden = p.shape !== 'jukebox';
  $('gallery').replaceChildren();
  if(p.externalUrl)clearExternal=mountExternal($('gallery'),p.externalUrl,p.title,{defer:false,lang:document.documentElement.lang.startsWith('ko')?'ko':'en'});
  for (const id of p.media || []) {
    const item = media.find(m => m.id === id);if (!item) continue;
    const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption'),original=document.createElement('a');
    image.alt=item.title;image.width=item.width;image.height=item.height;image.loading='lazy';image.decoding='async';
    image.onerror=()=>{image.hidden=true;caption.textContent=text.mediaError;};image.src=item.preview;
    caption.textContent=item.title;original.textContent=text.original+' ('+Math.ceil(item.bytes/1024)+' KB) ↗';original.href=item.original;original.target='_blank';original.rel='noopener noreferrer';
    figure.append(image,caption,original);$('gallery').append(figure);
  }
  popup.hidden = false;
  positionPopup();
  if(p.shape==='jukebox')void music.toggle();
  buttons.forEach((b,key) => b.setAttribute('aria-pressed',String(key === id)));
  if (focusMap) { camera = clampCamera(objectScreen(p),worldSize()); requestDraw(); }
  if (matchMedia('(max-width: 639px)').matches) scene.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  if (trigger) popup.focus({preventScroll:true});
}
$('close').addEventListener('click',() => closePopup(true));
root.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!tutorialPanel.hidden){e.preventDefault();tutorial.close();canvas.focus({preventScroll:true});}else if(!guide.hidden){e.preventDefault();showGuide(false);}else if(!popup.hidden){e.preventDefault();closePopup(true);}else if(area==='room'){e.preventDefault();changeArea('village');}});
buttons.forEach((b,id) => {
  b.addEventListener('click',e => visit(id,false,e.detail === 0 ? b : null));
  b.addEventListener('pointerenter',e => {if(e.pointerType !== 'touch') {hovered=id;requestDraw();}});
  b.addEventListener('pointerleave',() => {if(hovered===id) {hovered='';requestDraw();}});
  b.addEventListener('focus',() => {hovered=id;requestDraw();});
  b.addEventListener('blur',() => {if(hovered===id) {hovered='';requestDraw();}});
});
$('zoom').addEventListener('click',()=>{closePopup();scale=defaultZoom(width,height,area);requestDraw();});
zoomRange.addEventListener('pointerdown',()=>{zoomPointer=true;});
for(const event of ['pointerup','pointercancel'])life.on(window,event,()=>{zoomPointer=false;});
zoomRange.addEventListener('input',()=>{
  showZoomLabel();
  const value=Number(zoomRange.value)/100;
  // Keep native keyboard increments free to leave 100% after pointer snapping.
  scale=zoomPointer?snapZoom(value):clampZoom(value);closePopup();requestDraw();
});
const pointers = new Map();
let gesture = null, pinch = null, suppressClick = false;
function localPoint(e) {
  const r = scene.getBoundingClientRect();
  return {x:e.clientX-r.left-width/2,y:e.clientY-r.top-height/2-30};
}
function startGesture() {
  if (pointers.size >= 2) {
    pinch = {...pinchPoints([...pointers.values()]),camera:{...camera},scale};
    gesture = null; suppressClick = true; closePopup();
  } else if (pointers.size === 1) {
    const [id,point] = [...pointers][0];
    gesture = {id,point,camera:{...camera},drag:suppressClick}; pinch = null;
  } else { gesture = null; pinch = null; }
}
scene.addEventListener('pointerdown',e => {
  if (e.target.closest('#village-popup,[data-ui]') || e.button !== 0 || pointers.size >= 2) return;
  if (!pointers.size) suppressClick = false;
  pointers.set(e.pointerId,localPoint(e));
  if (e.pointerType === 'touch') scene.setPointerCapture(e.pointerId);
  startGesture();
});
scene.addEventListener('pointermove',e => {
  if(e.pointerType!=='touch'&&!pointers.size){const id=e.target.closest('[data-object]')?.dataset.object||'';if(id!==hovered){hovered=id;requestDraw();}}
  if (!pointers.has(e.pointerId)) return;
  const point = localPoint(e); pointers.set(e.pointerId,point);
  if (pinch) {
    const now = pinchPoints([...pointers.values()]);
    const next = zoomCamera(pinch.camera,pinch.scale,pinch.scale*now.distance/pinch.distance,pinch.center,now.center,worldSize());
    scale = next.scale; camera = next.camera; requestDraw();
    if(Math.abs(scale-pinch.scale)>.04)tutorial.complete('zoom');
    return;
  }
  if (!gesture) return;
  const dx = point.x-gesture.point.x, dy = point.y-gesture.point.y;
  if (!gesture.drag && !isDrag(dx,dy)) return;
  if (!gesture.drag) { gesture.drag = true; scene.setPointerCapture(e.pointerId); closePopup(); }
  scene.classList.add('is-dragging'); suppressClick = true;
  gesture.panned = true;
  camera = panCamera(gesture.camera,dx,dy,scale,worldSize()); requestDraw();
});
function finishGesture(e) {
  if (!pointers.has(e.pointerId)) return;
  const dragged = e.type==='pointerup' && gesture?.panned && !pinch;
  const tapped = e.type === 'pointerup' && !suppressClick && pointers.size === 1;
  const point = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (e.type !== 'pointerup') suppressClick = true;
  // Touch capture keeps pinch tracking reliable; resolve a plain tap before suppressing its synthetic click.
  if (tapped && e.pointerType === 'touch') {
    const r = scene.getBoundingClientRect();
    const target = document.elementFromPoint(point.x+r.left+width/2,point.y+r.top+height/2+30);
    const object = target?.closest('[data-object]');
    if (object) visit(object.dataset.object); else closePopup();
    suppressClick = true;
  }
  startGesture(); scene.classList.remove('is-dragging');
  if(dragged&&!pointers.size)tutorial.complete('drag');
}
scene.addEventListener('pointerup',finishGesture);
scene.addEventListener('pointercancel',finishGesture);
scene.addEventListener('lostpointercapture',finishGesture);
life.on(window,'pointerup',finishGesture);
scene.addEventListener('click',e => {
  if (e.target.closest('#village-popup,[data-ui]')) return;
  if (suppressClick && e.detail !== 0) {e.preventDefault();e.stopPropagation();return;}
  if (!e.target.closest('[data-object]')) closePopup();
},true);
scene.addEventListener('dragstart',e => e.preventDefault());
scene.addEventListener('wheel',e => {
  if (e.target.closest('#village-popup,[data-ui]') || pointers.size) return;
  e.preventDefault(); closePopup();
  const delta = e.deltaY*(e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1);
  const next = zoomCamera(camera,scale,scale*Math.exp(-Math.max(-200,Math.min(200,delta))*.002),localPoint(e),localPoint(e),worldSize());
  const zoomed=Math.abs(scale-next.scale)>.005;
  scale = next.scale; camera = next.camera; requestDraw();
  if(zoomed)tutorial.complete('zoom');
},{passive:false});
canvas.addEventListener('keydown',e => {
  const moves = {ArrowLeft:[-70,0],ArrowRight:[70,0],ArrowUp:[0,-70],ArrowDown:[0,70]};
  if (moves[e.key]) { e.preventDefault(); camera = panCamera(camera,-moves[e.key][0],-moves[e.key][1],scale,worldSize()); tutorial.complete('drag'); }
  else if (e.key === 'Home') { e.preventDefault(); camera = area==='room'?toScreen(4.5,4.5):{...villageCenter}; }
  else if (e.key === '+' || e.key === '=') { scale = clampZoom(scale*1.25); tutorial.complete('zoom'); }
  else if (e.key === '-') { scale = clampZoom(scale/1.25); tutorial.complete('zoom'); }
  else return;
  closePopup(); requestDraw();
});

$('music').addEventListener('click',() => void music.toggle());
$('seek').addEventListener('input',()=>music.seek(Number($('seek').value)));
life.on(document,'visibilitychange',() => {if(document.hidden) {gesture=null;pinch=null;pointers.clear();scene.classList.remove('is-dragging');}});

makeGround();root.classList.add('ready');resize();life.observe(canvas,resize);
const requestedWorker=new URLSearchParams(location.search).get('worker');
if(requestedWorker&&workers.some(w=>w.id===requestedWorker))visit(requestedWorker);

async function refreshPublicRoom(owner){
  if(!remoteContent||root.dataset.editor==='true'||participantEditor?.isOpen)return;
  try{
    const response=await fetch('/api/studio/room-view?owner='+encodeURIComponent(owner),{credentials:'omit',signal:AbortSignal.timeout(5000)});
    if(!response.ok)return;
    const data=await response.json();
    if(!data.room||!life.alive()||area!=='room'||activeWorker?.id!==owner||participantEditor?.isOpen)return;
    const proposal=studioSlice(remoteContent,owner);proposal.room=data.room;
    applyVillageCatalog(mergeStudio(remoteContent,owner,proposal));
  }catch{/* Keep the approved static layout when the live layout is unavailable. */}
}

function applyVillageCatalog(catalog){
  closePopup();
  const data=villageContent(catalog,document.documentElement.lang.startsWith('ko')?'ko':'en',text.title);
  Object.assign(sceneWorld,data.world);
  places.splice(0,places.length,...data.places);workers.splice(0,workers.length,...data.workers);media.splice(0,media.length,...data.media);
  root.dataset.music=JSON.stringify(data.music);
  selectMusic(places.find(p=>p.owner===activeWorker?.id&&p.shape==='jukebox')?.music||data.music);
  if(activeWorker){activeWorker=workers.find(w=>w.id===activeWorker.id);if(!activeWorker)changeArea('village');}
  const container=root.querySelector('.village-places'),sample=container.querySelector('button').cloneNode(true);
  buttons.clear();container.replaceChildren();
  for(const p of places.filter(p=>p.interactive!==false)){
    const b=sample.cloneNode(true);b.dataset.object=p.id;b.dataset.area=p.area;
    if(p.owner)b.dataset.owner=p.owner;else delete b.dataset.owner;
    b.setAttribute('aria-label',p.label);b.setAttribute('aria-pressed','false');b.querySelector('span').textContent=p.label;
    b.addEventListener('click',e=>visit(p.id,false,e.detail===0?b:null));
    for(const event of ['pointerenter','focus'])b.addEventListener(event,()=>{hovered=p.id;requestDraw();});
    for(const event of ['pointerleave','blur'])b.addEventListener(event,()=>{hovered='';requestDraw();});
    buttons.set(p.id,b);container.append(b);
  }
  objects.splice(0,objects.length,...[...sceneWorld.decorations,...(sceneWorld.layoutVersion===2?[]:worldLetters(sceneWorld))].map(decorationObject),...places.map(p=>({...p,draw:{house,board,game,jukebox,artwork}[p.shape]})),{...sceneWorld.mascot,worldId:'mascot',type:'character',draw:character,area:'village'});
  objects.sort((a,b)=>a.x+a.y-b.x-b.y);sprites.clear();makeGround();if(area==='room'){roomLevel=Math.min(roomLevel,roomFloors(activeWorker).length-1);makeRoom();updateFloors();}requestDraw();
}

const view=createSceneView(scene,$('fullscreen'));
$('fullscreen').addEventListener('click',()=>view.toggle());
life.on(window,'keydown',event=>{if(event.key==='Escape')view.close();});
const studioButton=$('studio'),previewMode=import.meta.env.DEV&&new URLSearchParams(location.search).get('studio')==='preview';
function setStudioOpen(open){studioButton.setAttribute('aria-expanded',String(open));studioButton.setAttribute('aria-label',open?'설정 닫기':studioButton.dataset.session==='guest'?'Discord로 로그인':'작업실 설정');}
function setIdentity(value){studioButton.dataset.session=value?'member':'guest';setStudioOpen(false);return value;}
const identityReady=previewMode?Promise.resolve(null):fetch('/api/studio/session',{cache:'no-store',signal:life.signal}).then(async r=>{if(r.status===401)return setIdentity(null);if(!r.ok)throw Error('Session unavailable');return setIdentity(await r.json());}).catch(()=>undefined);
$('home').addEventListener('click',async()=>{await openStudio(true);participantEditor?.home();});
async function openStudio(home=false){
  studioButton.disabled=true;
  try{
    if(participantEditor){if(participantEditor.isOpen&&!home){participantEditor.close();return;}participantEditor.open();setStudioOpen(true);return;}
    const identity=await identityReady;if(!previewMode&&identity===null){location.assign('/api/studio/login');return;}
    const {createParticipantEditor}=await import('./village-participant.js');
    if(!life.alive())return;
    participantEditor=await createParticipantEditor({root,scene,canvas,ctx,requestDraw,identity,
      signal:life.signal,onClose:()=>setStudioOpen(false),loginRequired:()=>{setIdentity(null);location.assign('/api/studio/login');},catalog:remoteContent,preview:previewMode,
      state:()=>({area,worker:activeWorker,level:roomLevel,scale}),
      point:event=>{const r=scene.getBoundingClientRect(),sx=(event.clientX-r.left-width/2)/scale+camera.x,sy=(event.clientY-r.top-height/2-30)/scale+camera.y;return area==='room'?roomPoint({x:sx,y:sy},activeWorker,roomLevel):{x:sx/48+sy/24,y:sy/24-sx/48};},
      apply:applyVillageCatalog,enter:(owner,level=0)=>{activeWorker=workers.find(w=>w.id===owner);if(activeWorker){changeArea('room');setRoomLevel(level);}},closePopup,
    });
    setStudioOpen(participantEditor.isOpen);
  }catch{studioButton.title='작업실 연결 실패 · 다시 시도';}
  finally{studioButton.disabled=false;}
}
studioButton?.addEventListener('click',async()=>{await openStudio();if(participantEditor?.isOpen)tutorial.complete('edit');});
if(['1','preview'].includes(new URLSearchParams(location.search).get('studio')))void openStudio();
life.cleanup(()=>{unsubscribeMusic();clearTimeout(zoomLabelTimer);cancelAnimationFrame(frame);clearExternal?.();view.close();tutorial.close();});
// VILLAGE_EDITOR_BRIDGE
});
