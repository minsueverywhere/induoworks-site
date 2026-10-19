import {createSceneNotice} from './village-notice.mjs';
import {mountGuestbook} from './village-guestbook.js';
import {bindZoomSlider} from './zoom-slider.mjs';
import {mergeVillage} from '../server/studio-village-layout.mjs';
import {studioSlice,mergeStudio} from '../server/studio-content.mjs';
import {villageSky} from './village-sky.mjs';
import {onPage} from './page-lifecycle.mjs';
import {siteMusic,sameMusic} from './site-music.mjs';
import {createSceneView} from './village-view.mjs';
import { terrainAt, terrainBounds, groundPosition, worldLetters } from './village-world.mjs';
import { musicArtist } from './village-tracks.mjs';
import { fitMarquee } from './marquee.mjs';
import { MIN_ZOOM, MAX_ZOOM, toScreen, clampCamera, panCamera, clampZoom, defaultZoom, snapZoom, isDrag, zoomCamera, pinchPoints } from './village-camera.mjs';
import { landscapeNoise as noise } from './village-layout.mjs';
import { createTutorial, contextTutorialSteps } from './village-tutorial.mjs';
import { musicTime } from './village-music.mjs';
import { popupPosition,guestbookFrame } from './village-popup.mjs';
import {mountExternal} from './external-player.mjs';
import { loadContent } from './content-loader.mjs';
import { villageContent } from './village-content.mjs';
import {roomFloors,roomStack,roomElevation,roomScreen,roomPoint} from './village-room.mjs';
onPage('village-section',async(root,life)=>{
const liveRooms=new Map();
let remoteContent=await loadContent();
if(remoteContent&&root.dataset.editor!=='true'&&new URLSearchParams(location.search).get('studio')!=='preview'){
  try{const response=await fetch('/api/studio/village-view',{credentials:'omit',signal:AbortSignal.timeout(5000)});if(response.ok){const data=await response.json();if(data.layout)remoteContent=mergeVillage(remoteContent,data.layout);}}catch{/* Keep the static village when the live layout cannot be read. */}
}
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
const sceneNotice=createSceneNotice($('notice'),document.documentElement.lang.startsWith('ko'));life.cleanup(()=>sceneNotice.dispose());
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
let zoomLabelTimer;
function showZoomLabel(){const hud=zoomRange.closest('.village-hud');hud.dataset.adjusting='true';clearTimeout(zoomLabelTimer);zoomLabelTimer=setTimeout(()=>{hud.dataset.adjusting='false';},900);}
let popupTrigger = null;
let popupObject = null, tutorialStep = null, pendingHouse = null;
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
  $('back').classList.remove('tutorial-target');$('edit').classList.remove('tutorial-target');
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
  if(step==='edit')$('edit').classList.add('tutorial-target');
  if(step==='exit'){$('back').classList.add('tutorial-target');$('back').focus({preventScroll:true});}
  requestDraw();
},tutorialSteps);
tutorialSkip.addEventListener('click',()=>{tutorial.close();canvas.focus({preventScroll:true});});
let playing=false,playingTrack;
// The now-playing bar follows the shared music session, so it stays put across rooms and clicks.
function syncMusic(data){
  const nextPlaying=data.state==='playing';
  if(playing!==nextPlaying||playingTrack!==data.track&&!sameMusic(playingTrack,data.track)){sprites.clear();requestDraw();}
  playing=nextPlaying;playingTrack=data.track;
  const bar=$('now');bar.hidden=!data.visible||!data.track;if(bar.hidden)return;
  const title=$('now-title'),label=data.track.title+' — '+musicArtist(data.track),track=$('now-track');
  if(title.firstElementChild.textContent!==label){title.firstElementChild.textContent=label;fitMarquee(title);}
  track.setAttribute('aria-label',(document.documentElement.lang.startsWith('ko')?'재생 위치 · ':'Playback position · ')+label);track.setAttribute('aria-valuemax',String(data.duration||1));track.setAttribute('aria-valuenow',String(data.current));
  track.setAttribute('aria-valuetext',musicTime(data.current)+' / '+musicTime(data.duration));track.style.setProperty('--progress',(data.duration?Math.min(100,data.current/data.duration*100):0)+'%');$('time').textContent=musicTime(data.current)+' / '+musicTime(data.duration);
  $('music').dataset.loading=String(data.state==='loading');$('music').setAttribute('aria-label',playing?text.pause:text.play);$('music').setAttribute('aria-pressed',String(playing));
  if(playing)tutorial.complete('music');
}
const unsubscribeMusic=siteMusic.subscribe(syncMusic);
function objectPoint(o){return o.area==='village'||o.editType==='exhibit'?(o.ground||groundPosition(o,o.shape||o.type)):o;}
function objectDepth(o){const p=objectPoint(o);return p.x+p.y;}
function objectScreen(o){const p=objectPoint(o);return o.area==='room'?roomScreen(p,activeWorker,o.floor||0):toScreen(p.x,p.y);}
const decorationObject=d=>({...d,ground:groundPosition(d,d.type),worldId:d.legacy?undefined:d.id,id:undefined,interactive:false,area:'village',draw:d.type==='tree'?tree:d.type==='letter'?letter:d.type==='sign'?smallSign:grass});
const objects = [...[...sceneWorld.decorations.filter(d=>d.type!=='grass'),...(sceneWorld.layoutVersion===2?[]:worldLetters(sceneWorld))].map(decorationObject), ...places.map(p => ({...p, draw: {house, board, game, jukebox, artwork, guestbook}[p.shape]})), {...sceneWorld.mascot,worldId:'mascot',type:'character',draw:character,area:'village'}].sort((a,b)=>objectDepth(a)-objectDepth(b));
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
  // Grass tufts and flowers are painted into the ground in a fixed pattern, so they never block placement.
  for(const {x,y,type} of [...sceneWorld.tiles].sort((a,b)=>a.x+a.y-b.x-b.y)){
    if(type!=='grass'||noise(Math.floor(x/3),Math.floor(y/3),4)>=.55||noise(x,y,1)>=.28)continue;
    const p=toScreen(x+(noise(x,y,2)-.5)*.7,y+(noise(x,y,3)-.5)*.7);
    ground.save();ground.translate(p.x,p.y);grass(ground,{size:1,flower:noise(x,y,5)<.35});ground.restore();
  }
}
function house(c, object){
  c.translate(0,-3);
  const style=object.style||'house';
  if(style==='tent'){
    polygon(c,[[-43,3],[0,24],[43,3],[0,-18]],'#aa8f64');
    polygon(c,[[-18,-65],[24,-44],[0,19],[-43,-3]],'#d7c79e');
    polygon(c,[[24,-44],[43,-3],[0,19]],'#bba77d');
    polygon(c,[[23,-33],[34,1],[8,14]],'#526347');
    polygon(c,[[24,-44],[26,-5],[43,-3]],'#e7d8ad');
    c.strokeStyle='#8d7452';c.lineWidth=1;c.beginPath();c.moveTo(-18,-65);c.lineTo(-49,7);c.moveTo(24,-44);c.lineTo(49,10);c.stroke();
    c.save();c.transform(1,.5,0,1,-35,-14);c.fillStyle='#c59c68';c.fillRect(0,0,30,11);c.fillStyle='#59482f';c.font='600 6px system-ui';c.textAlign='center';facingText(c,object,object.title,15,8,26);c.restore();return;
  }
  const cabin=style==='cabin';
  box(c,0,-18,43,21,50,cabin?['#c59c68','#b58f62','#8a684c']:['#e8d3a1','#ddc18c','#bea877']);
  if(cabin){c.strokeStyle='#8a684c';c.lineWidth=1;for(let y=-55;y<-2;y+=9){c.beginPath();c.moveTo(-42,y);c.lineTo(0,y+21);c.lineTo(42,y);c.stroke();}}
  const roof=cabin?['#587b59','#719366','#45654a']:object.id==='induo-works'?['#456c92','#6088ac','#234567']:['#ad6245','#ca7b51','#98563d'];
  polygon(c,[[-43,-47],[0,-72],[43,-47],[0,-25]],roof[0]);polygon(c,[[-43,-47],[-43,-56],[0,-85],[0,-72]],roof[1]);polygon(c,[[0,-85],[43,-56],[43,-47],[0,-72]],roof[2]);
  if(!cabin)box(c,14,-69,5,3,16,['#d0b392','#ac8e76','#866d5d']);
  // The door follows the right wall's isometric face.
  c.save(); c.transform(1,-21/43,0,1,0,-26);
  c.fillStyle='#705a3b';c.fillRect(12,19,15,31);c.fillStyle='#ead0a1';c.fillRect(15,35,2,2);c.restore();
  c.save();c.transform(1,21/43,0,1,-39,-36);
  c.fillStyle='#8d6543';c.fillRect(0,0,36,15);
  c.fillStyle='#c59c68';c.fillRect(1,1,34,13);
  c.fillStyle='#ae8657';c.fillRect(2,7,32,1);
  c.fillStyle='#59482f';c.font='600 6px system-ui, sans-serif';c.textAlign='center';facingText(c,object,object.title,18,10,30);c.restore();
}

function smallSign(c,object){
  c.strokeStyle='#755b3e';c.lineWidth=3;c.beginPath();c.moveTo(0,0);c.lineTo(0,-29);c.stroke();
  c.save();c.transform(1,.5,0,1,-18,-30);c.fillStyle='#c6a77a';c.fillRect(0,-18,36,18);c.strokeStyle='#977449';c.lineWidth=1;c.strokeRect(0,-18,36,18);c.fillStyle='#59482f';c.font='600 5px system-ui';c.textAlign='center';c.fillText(object.title||'',18,-7,30);c.restore();
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
  c.translate(0,-10);
  box(c,0,-1,21,11,4,['#b58f62','#8a684c','#71543d']);
  // The panel shares the left tile edge's slope instead of facing the screen.
  c.save();c.transform(1,.5,0,1,-18,-3);
  c.fillStyle='#765b43';c.fillRect(0,-42,36,42);
  c.fillStyle=['#465c68','#63775b','#826d80'][object.id.length%3];c.fillRect(3,-39,30,35);
  c.fillStyle='#e8d8a3';c.fillRect(8,-29,20,2);c.fillRect(12,-23,12,2);c.fillStyle='#b6c59e';c.fillRect(8,-15,20,5);c.restore();
}
function jukebox(c,object) {
  const active=playing&&sameMusic(playingTrack,object?.music);
  c.translate(0,5);
  box(c,0,-16,22,11,22,['#d7c79e','#b58f62','#8a684c']);
  c.fillStyle='#234567';c.beginPath();c.ellipse(-3,-27,13,6.5,0,0,Math.PI*2);c.fill();
  c.strokeStyle='#60808b';c.lineWidth=.7;c.beginPath();c.ellipse(-3,-27,10,5,0,0,Math.PI*2);c.stroke();
  c.fillStyle=active?'#f5d6ad':'#b4b89b';c.beginPath();c.ellipse(-3,-27,4,2,0,0,Math.PI*2);c.fill();
  c.fillStyle='#725d3c';c.fillRect(-4,-29,2,3);
  c.strokeStyle='#526347';c.lineWidth=2;c.lineCap='round';c.beginPath();c.moveTo(14,-28);c.lineTo(active?12:17,-20);c.lineTo(active?2:17,active?-22:-15);c.stroke();
  c.fillStyle='#526347';c.beginPath();c.ellipse(14,-28,2,1.2,0,0,Math.PI*2);c.fill();
  c.save();c.transform(1,.5,0,1,-19,-21);c.strokeStyle='#765b43';c.lineWidth=1;for(let y=2;y<=11;y+=3){c.beginPath();c.moveTo(1,y);c.lineTo(14,y);c.stroke();}c.restore();
  c.fillStyle=active?'#ffe3a5':'#526347';c.beginPath();c.arc(12,-3,active?2.3:1.5,0,Math.PI*2);c.fill();
}

function artwork(c,object) {
  c.translate(0,-10);
  box(c,0,-1,21,11,4,['#b58f62','#8a684c','#71543d']);
  c.save();c.transform(1,.5,0,1,-18,-3);
  c.fillStyle='#856747';c.fillRect(0,-42,36,42);c.fillStyle='#f8edcc';c.fillRect(3,-39,30,35);
  const badge=badges.get(object.badge);if(badge?.complete&&badge.naturalWidth){const fit=Math.min(28/badge.naturalWidth,28/badge.naturalHeight),w=badge.naturalWidth*fit,h=badge.naturalHeight*fit;c.drawImage(badge,4+(28-w)/2,-36+(28-h)/2,w,h);}c.restore();
}
function makeRoom() {
  roomLayers=roomStack(activeWorker,roomLevel).map(layer=>{
  const {floor,elevation}=layer,b=terrainBounds(floor),h=floor.wallHeight,left=toScreen(b.minX,b.maxY).x-25,top=toScreen(b.minX,b.minY).y-12-h;
  const canvas=document.createElement('canvas');canvas.width=toScreen(b.maxX,b.minY).x+26-left;canvas.height=toScreen(b.maxX,b.maxY).y+22-top;
  const c=canvas.getContext('2d');c.translate(-left,-top);
  for(const {x,y,type}of floor.tiles){if(type==='transparent')continue;const p=toScreen(x,y);
    if(!terrainAt(floor,x,y-1))polygon(c,[[p.x,p.y-12-h],[p.x+24,p.y-h],[p.x+24,p.y],[p.x,p.y-12]],'#e7d8ad');
    if(!terrainAt(floor,x-1,y))polygon(c,[[p.x-24,p.y-h],[p.x,p.y-12-h],[p.x,p.y-12],[p.x-24,p.y]],'#d7c79e');
  }
  for(const {x,y}of [...floor.tiles].filter(t=>t.type!=='transparent').sort((a,b)=>a.x+a.y-b.x-b.y)){const p=toScreen(x,y);polygon(c,[[p.x-24,p.y],[p.x,p.y+12],[p.x+24,p.y],[p.x+24,p.y+8],[p.x,p.y+20],[p.x-24,p.y+8]],'#9b805d');tile(c,x,y,(x+y)%2?'#bf9c6d':'#caa978');}
  return {...layer,canvas,x:left,y:top-elevation};
  });
}
function setRoomLevel(level){
  roomLevel=Math.max(0,Math.min(roomFloors(activeWorker).length-1,level));closePopup();hovered='';makeRoom();
  const b=terrainBounds(currentRoom());camera=roomScreen({x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2},activeWorker,roomLevel);sprites.clear();updateFloors();requestDraw();participantEditor?.areaChanged();
}
function updateFloors(){
  if(participantEditor?.renderFloors())return;
  const bar=$('floors');bar.hidden=area!=='room';bar.replaceChildren();
  roomFloors(activeWorker).forEach((_,i)=>{const b=document.createElement('button');b.type='button';b.textContent=(i+1)+(document.documentElement.lang.startsWith('ko')?'층':'F');b.setAttribute('aria-pressed',String(i===roomLevel));b.addEventListener('click',()=>setRoomLevel(i));bar.append(b);});
}

function character(c){
  c.fillStyle='#425d3a35';c.beginPath();c.ellipse(0,3,10,4,0,0,Math.PI*2);c.fill();
  c.fillStyle='#e6ca89';c.fillRect(-7,-16,14,15);c.fillStyle='#e9d69b';c.fillRect(-9,-27,18,15);c.fillStyle='#ba8b57';c.fillRect(-11,-25,4,10);c.fillRect(7,-25,4,10);c.fillStyle='#314950';c.fillRect(-5,-23,2,2);c.fillRect(3,-23,2,2);c.fillRect(-2,-19,4,3);c.fillStyle='#476879';c.fillRect(-7,-12,14,4);c.fillStyle='#b58d4c';c.fillRect(-8,-29,16,3);c.fillStyle='#acbeac';c.fillRect(-6,-30,4,4);c.fillRect(2,-30,4,4);
}
function guestbook(c){
  c.strokeStyle='#755b3e';c.lineWidth=3;
  for(const [x,y]of [[-18,0],[0,9],[18,0]]){c.beginPath();c.moveTo(x,y-18);c.lineTo(x,y);c.stroke();}
  box(c,0,-29,22,11,3,['#c6a77a','#977449','#755b3e']);
  polygon(c,[[-14,-22],[1,-29],[14,-23],[-1,-16]],'#faf0d4');
  c.strokeStyle='#b5a58a';c.lineWidth=.7;c.beginPath();c.moveTo(-8,-22);c.lineTo(2,-18);c.moveTo(-4,-24);c.lineTo(6,-20);c.moveTo(0,-26);c.lineTo(10,-22);c.stroke();
  c.strokeStyle='#526347';c.lineWidth=1.5;c.beginPath();c.moveTo(5,-15);c.lineTo(14,-19);c.stroke();
}
function spriteBounds() {return [-64,-112,128,144];}
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
  syncEditButton();
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
  popup.style.right='';
  const r=scene.getBoundingClientRect();
  if(popup.dataset.guestbook==='true'){
    const frame=guestbookFrame({width,height,top:r.top},globalThis.visualViewport?.height||innerHeight,globalThis.visualViewport?.offsetTop||0);
    popup.style.width=frame.width+'px';popup.style.height=frame.height+'px';popup.style.maxHeight=frame.height+'px';
    popup.style.left=frame.x+'px';popup.style.top=frame.y+'px';return;
  }
  popup.style.width='';popup.style.height='';
  const target=buttons.get(popupObject),b=target.getBoundingClientRect();
  const anchor={x:b.left-r.left,y:b.top-r.top,width:b.width,height:b.height},top=area==='room'?64:12;
  const space=Math.max(anchor.y-top-14,height-12-anchor.y-anchor.height-14);
  popup.style.maxHeight=Math.max(100,Math.min(330,height-100,space))+'px';
  const p=popupPosition(anchor,{width:popup.offsetWidth,height:popup.offsetHeight},{width,height,top});
  popup.style.left=p.x+'px';popup.style.top=p.y+'px';popup.dataset.side=p.side;
}
function positionTutorial() {
  if(!tutorialStep)return;
  const r=scene.getBoundingClientRect();
  let focus=r;
  if(tutorialStep==='house'||tutorialStep==='music')focus=buttons.get(tutorialStep==='house'?tutorialHouse.id:tutorialJukebox.id).getBoundingClientRect();
  if(tutorialStep==='work')focus=buttons.get(tutorialExhibit.id).getBoundingClientRect();
  if(tutorialStep==='edit')focus=$('edit').getBoundingClientRect();
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
$('back').addEventListener('click',async()=>{
  if(participantEditor?.isOpen&&!await participantEditor.close())return;
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
  if(p.shape==='house'){
    // Keep showing the current place until the house's latest layout has arrived, then switch once.
    if(pendingHouse===id)return;
    pendingHouse=id;
    return refreshPublicRoom(id).then(()=>{
      if(pendingHouse!==id)return;pendingHouse=null;
      activeWorker=workers.find(w=>w.id===id);if(!activeWorker)return;
      if(area==='room')changeArea('village');
      changeArea('room');tutorial.complete('house');
    });
  }
  if(p.shape==='jukebox'){closePopup();void siteMusic.toggle(p.music||JSON.parse(root.dataset.music));return;}
  if(!popup.hidden&&popupObject===id){closePopup(Boolean(trigger));return;}
  clearExternal?.();clearExternal=null;
  if(p.externalUrl)siteMusic.pause();
  popupObject=id;
  popupTrigger = trigger || buttons.get(id);
  popup.dataset.guestbook=String(p.shape==='guestbook');
  $('title').textContent=p.title;
  $('description').textContent=p.description;
  $('links').replaceChildren();
  for (const item of p.links || []) {
    const a = document.createElement('a'); a.href = item.href;
    const titleLink=p.shape==='game';
    if(titleLink){
      a.setAttribute('aria-label',item.title);a.title=item.title;
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
      path.setAttribute('d','M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7');svg.append(path);a.append(svg);
    }else a.textContent=item.title+' ↗';
    if(new URL(a.href).origin!==location.origin){a.target='_blank';a.rel='noopener noreferrer';}
    (titleLink?$('title'):$('links')).append(a);
  }
  $('gallery').replaceChildren();
  if(p.shape==='guestbook')clearExternal=mountGuestbook($('gallery'),p.owner,{visit:id=>{closePopup();visit(id);},notice:sceneNotice,board:p.board});
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
  buttons.forEach((b,key) => b.setAttribute('aria-pressed',String(key === id)));
  if (focusMap) { camera = clampCamera(objectScreen(p),worldSize()); requestDraw(); }
  if (matchMedia('(max-width: 639px)').matches) scene.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  if (trigger) popup.focus({preventScroll:true});
}
$('close').addEventListener('click',() => closePopup(true));
root.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!tutorialPanel.hidden){e.preventDefault();tutorial.close();canvas.focus({preventScroll:true});}else if(!guide.hidden){e.preventDefault();showGuide(false);}else if(!popup.hidden){e.preventDefault();closePopup(true);}else if(area==='room'&&!participantEditor?.isOpen){e.preventDefault();changeArea('village');}});
buttons.forEach((b,id) => {
  b.addEventListener('click',e => visit(id,false,e.detail === 0 ? b : null));
  b.addEventListener('pointerenter',e => {if(e.pointerType !== 'touch') {hovered=id;requestDraw();}});
  b.addEventListener('pointerleave',() => {if(hovered===id) {hovered='';requestDraw();}});
  b.addEventListener('focus',() => {hovered=id;requestDraw();});
  b.addEventListener('blur',() => {if(hovered===id) {hovered='';requestDraw();}});
});
$('zoom').addEventListener('click',()=>{closePopup();scale=defaultZoom(width,height,area);requestDraw();});
bindZoomSlider(zoomRange,(value,pointer)=>{
  showZoomLabel();scale=pointer?snapZoom(value/100):clampZoom(value/100);closePopup();requestDraw();
},active=>{zoomRange.closest('.village-zoom-track').dataset.active=String(active);showZoomLabel();},life.signal);
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
scene.addEventListener('dragstart',e => {if(!e.target.closest('#village-popup,[data-ui]'))e.preventDefault();});
scene.addEventListener('wheel',e => {
  if (e.target.closest('#village-popup,[data-ui]') || pointers.size) return;
  e.preventDefault(); closePopup();
  const delta = e.deltaY*(e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1);
  // Wheel zoom keeps the view centre still; dragging alone moves the map.
  const next = zoomCamera(camera,scale,scale*Math.exp(-Math.max(-200,Math.min(200,delta))*.002),{x:0,y:0},{x:0,y:0},worldSize());
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

$('music').addEventListener('click',() => void siteMusic.toggle());
let seeking=null;
function seekAt(event){const {duration}=siteMusic.snapshot();if(!duration)return;const r=$('now-track').getBoundingClientRect();siteMusic.seek(Math.max(0,Math.min(1,(event.clientX-r.left)/r.width))*duration);}
$('now-track').addEventListener('pointerdown',event=>{if(event.button!==0)return;seeking=event.pointerId;$('now').dataset.seeking='';seekAt(event);try{$('now-track').setPointerCapture(event.pointerId);}catch{/* Seeking still follows moves over the bar. */}});
$('now-track').addEventListener('pointermove',event=>{if(seeking===event.pointerId)seekAt(event);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('now-track').addEventListener(type,()=>{seeking=null;delete $('now').dataset.seeking;});
$('now-track').addEventListener('keydown',event=>{
  const {current,duration}=siteMusic.snapshot(),next={ArrowLeft:current-5,ArrowRight:current+5,Home:0,End:duration-1}[event.key];
  if(next===undefined||!duration)return;event.preventDefault();siteMusic.seek(Math.max(0,Math.min(duration,next)));
});
life.on(document,'visibilitychange',() => {if(document.hidden) {gesture=null;pinch=null;pointers.clear();scene.classList.remove('is-dragging');}});

makeGround();root.classList.add('ready');resize();life.observe(canvas,resize);
const requestedWorker=new URLSearchParams(location.search).get('worker');
// A shared workshop link opens straight into the room instead of flashing the village first.
if(requestedWorker&&workers.some(w=>w.id===requestedWorker)){canvas.style.visibility='hidden';void Promise.resolve(visit(requestedWorker)).finally(()=>{canvas.style.visibility='';});}

async function refreshPublicRoom(owner){
  if(!remoteContent||root.dataset.editor==='true'||participantEditor?.isOpen)return;
  try{
    const response=await fetch('/api/studio/room-view?owner='+encodeURIComponent(owner),{credentials:'omit',cache:'no-cache',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('Room unavailable');
    const data=await response.json();
    if(!data.room||!life.alive()||pendingHouse!==owner||participantEditor?.isOpen)return;
    liveRooms.set(owner,data.room);
    const proposal=studioSlice(remoteContent,owner);proposal.room=data.room;
    applyVillageCatalog(mergeStudio(remoteContent,owner,proposal));
  }catch{sceneNotice.message('최신 배치를 불러오지 못해 기본 배치를 표시합니다.');}
}

function applyVillageCatalog(catalog){
  if(!participantEditor?.isOpen)catalog={...catalog,workers:catalog.workers.map(w=>liveRooms.has(w.id)?{...w,room:liveRooms.get(w.id)}:w)};
  if(remoteContent&&root.dataset.editor!=='true')catalog={...catalog,world:remoteContent.world,workers:catalog.workers.map(w=>({...w,name:w.followDiscordName?(remoteContent.workers.find(p=>p.id===w.id)?.name||w.name):w.name,house:remoteContent.workers.find(p=>p.id===w.id)?.house}))};
  closePopup();
  const data=villageContent(catalog,document.documentElement.lang.startsWith('ko')?'ko':'en',text.title);
  Object.assign(sceneWorld,data.world);
  places.splice(0,places.length,...data.places);workers.splice(0,workers.length,...data.workers);media.splice(0,media.length,...data.media);
  root.dataset.music=JSON.stringify(data.music);
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
  objects.splice(0,objects.length,...[...sceneWorld.decorations,...(sceneWorld.layoutVersion===2?[]:worldLetters(sceneWorld))].map(decorationObject),...places.map(p=>({...p,draw:{house,board,game,jukebox,artwork,guestbook}[p.shape]})),{...sceneWorld.mascot,worldId:'mascot',type:'character',draw:character,area:'village'});
  objects.sort((a,b)=>objectDepth(a)-objectDepth(b));sprites.clear();makeGround();if(area==='room'){roomLevel=Math.min(roomLevel,roomFloors(activeWorker).length-1);makeRoom();updateFloors();}requestDraw();
}

function drawPlacementPreview(kind,point,ref,valid){
  const render={tree,grass,sign:smallSign,project:game,media:artwork,music:jukebox,guestbook}[kind];if(!render)return;
  const p=toScreen(point.x,point.y);ctx.save();ctx.translate(p.x,p.y);ctx.globalAlpha*=valid ? .5 : .25;render(ctx,{id:'preview-'+kind+'-'+(ref||''),size:1,title:kind==='sign'?'간판':'',flower:false});ctx.restore();
}
const apiVillagePoint=event=>{const r=scene.getBoundingClientRect();return {x:(event.clientX-r.left-width/2)/scale+camera.x,y:(event.clientY-r.top-height/2-30)/scale+camera.y};};
const view=createSceneView(scene,$('fullscreen'));
$('fullscreen').addEventListener('click',()=>view.toggle());
life.on(window,'keydown',event=>{if(event.key==='Escape')view.close();});
const studioButton=$('studio'),editButton=$('edit'),previewMode=import.meta.env.DEV&&new URLSearchParams(location.search).get('studio')==='preview';
let identity,editorLoading;
function setIdentity(value){identity=value;studioButton.dataset.session=value?'member':'guest';studioButton.setAttribute('aria-label',value?'설정':'Discord로 로그인');studioButton.title=studioButton.getAttribute('aria-label');return value;}
const identityReady=previewMode?Promise.resolve(null):fetch('/api/studio/session',{cache:'no-store',signal:life.signal}).then(async r=>{if(r.status===401)return setIdentity(null);if(!r.ok)throw Error('Session unavailable');return setIdentity(await r.json());}).catch(()=>undefined);
if(previewMode)studioButton.dataset.session='member';
// One editor per page: concurrent clicks share the same load instead of building duplicate menus.
function ensureEditor(){
  return editorLoading||=(async()=>{
    const who=await identityReady;
    if(!previewMode&&who===null){location.assign('/api/studio/login');return null;}
    const {createParticipantEditor}=await import('./village-participant.js');
    if(!life.alive())return null;
    participantEditor=await createParticipantEditor({root,scene,canvas,ctx,requestDraw,identity:who,accountOnly:true,accountPanel:$('account-menu'),accountButton:studioButton,onOpen:requestDraw,
      floorBar:$('floors'),updateFloors,editorUI:()=>{
        $('back').hidden=area!=='room';$('home').hidden=area==='room';
        $('caption').textContent=area==='room'?activeWorker.name.toUpperCase():text.title.toUpperCase();
        const labelText=text.back;$('back').setAttribute('aria-label',labelText);$('back').title=labelText;
      },
      signal:life.signal,onClose:requestDraw,loginRequired:()=>{setIdentity(null);location.assign('/api/studio/login');},catalog:remoteContent,preview:previewMode,previewHost:import.meta.env.DEV&&new URLSearchParams(location.search).get('host')==='preview',
      state:()=>({area,worker:activeWorker,level:roomLevel,scale}),
      point:event=>{const r=scene.getBoundingClientRect(),sx=(event.clientX-r.left-width/2)/scale+camera.x,sy=(event.clientY-r.top-height/2-30)/scale+camera.y;return area==='room'?roomPoint({x:sx,y:sy},activeWorker,roomLevel):{x:sx/48+sy/24,y:sy/24-sx/48};},
      previewPlacement:drawPlacementPreview,
      applyLayout:layout=>{remoteContent=mergeVillage(remoteContent,layout);applyVillageCatalog(remoteContent);},
      pickVillage:event=>{const point=apiVillagePoint(event);for(const o of [...objects].reverse()){if(o.area!=='village')continue;const p=objectPoint(o),screen=toScreen(p.x,p.y),[left,top,w,h]=spriteBounds(o),x=point.x-screen.x-left,y=point.y-screen.y-top;if(x<0||y<0||x>=w||y>=h)continue;try{if(sprite({...o,id:o.id||'pick:'+o.worldId},false).getContext('2d').getImageData(Math.floor(x*2),Math.floor(y*2),1,1).data[3]>20)return o.worldId||o.id;}catch{}}return null;},
      apply:(catalog,owner)=>{if(owner)liveRooms.set(owner,catalog.workers.find(w=>w.id===owner)?.room);applyVillageCatalog(catalog);},enter:(owner,level=0)=>{activeWorker=workers.find(w=>w.id===owner);if(activeWorker){changeArea('room');setRoomLevel(level);}},closePopup,
    });
    requestDraw();return participantEditor;
  })().catch(()=>{editorLoading=null;studioButton.title='작업실 연결 실패 · 다시 시도';return null;});
}
function syncEditButton(){
  const who=participantEditor?.identity||identity,open=Boolean(participantEditor?.isOpen);
  const canEdit=Boolean(who)&&(area==='room'?who.host||who.owners?.includes(activeWorker?.id):who.host);
  editButton.hidden=!open&&!canEdit;
  if(open)scene.style.setProperty('--edit-width',editButton.offsetWidth+'px');
  const ko=document.documentElement.lang.startsWith('ko'),label=open?(ko?'완료':'Done'):(ko?'편집':'Edit');if(editButton.lastChild.textContent!==label){editButton.lastChild.textContent=label;editButton.setAttribute('aria-pressed',String(open));}
}
editButton.addEventListener('click',async()=>{
  const editor=await ensureEditor();if(!editor)return;
  if(editor.isOpen)await editor.close();else{await editor.open(area==='room'?activeWorker?.id:undefined);if(editor.isOpen)tutorial.complete('edit');}
  requestDraw();
});
studioButton.addEventListener('click',async()=>{(await ensureEditor())?.toggleAccount();});
$('home').addEventListener('click',async()=>{await (await ensureEditor())?.home();});
if(['1','preview'].includes(new URLSearchParams(location.search).get('studio')))void ensureEditor().then(editor=>editor?.open());
life.cleanup(()=>{unsubscribeMusic();clearTimeout(zoomLabelTimer);cancelAnimationFrame(frame);clearExternal?.();view.dispose();tutorial.close();});
// VILLAGE_EDITOR_BRIDGE
});
