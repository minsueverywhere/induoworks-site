import { SIZE, MIN_ZOOM, MAX_ZOOM, toScreen, clampCamera, panCamera, clampZoom, defaultZoom, snapZoom, isDrag, zoomCamera, pinchPoints } from './village-camera.mjs';
import { isPond, isPath, signLetterLayout, landscapeNoise as noise } from './village-layout.mjs';
import { createTutorial } from './village-tutorial.mjs';
import { popupPosition } from './village-popup.mjs';
const root = document.getElementById('village-section');
const villageCenter = toScreen(9,9);
const $ = id => document.getElementById('village-' + id);
const workers = JSON.parse(root.dataset.workers);
let activeWorker = null;
const places = JSON.parse(root.dataset.places), text = JSON.parse(root.dataset.text), media = JSON.parse(root.dataset.media);
const badges = new Map(), sprites = new Map();
let area = 'village', savedVillage = null;
const roomTerrain = document.createElement('canvas');
function worldSize() { return area === 'room' ? 10 : SIZE; }
let hovered = '';
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const popup = $('popup');
const zoomRange = $('zoom-range');
let zoomPointer = false;
let popupTrigger = null;
let popupObject = null, tutorialStep = null;
const scene = $('scene'), terrain = document.createElement('canvas'), ground = terrain.getContext('2d');
const help = $('help'), helpToggle = $('help-toggle'), guide = $('hint');
function showGuide(open) { guide.hidden=!open; }
helpToggle.addEventListener('click',()=>{
  closePopup(); changeArea('village'); camera={...villageCenter}; scale=defaultZoom(width,height);
  showGuide(false); tutorial.start(); requestDraw(); canvas.focus({preventScroll:true});
  scene.scrollIntoView({block:'nearest',behavior:'instant'});
});
help.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')showGuide(true);});
help.addEventListener('pointerleave',()=>showGuide(false));
helpToggle.addEventListener('focus',()=>showGuide(true));
help.addEventListener('focusout',()=>showGuide(false));
document.addEventListener('click',event=>{if(!help.contains(event.target))showGuide(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape') {showGuide(false);tutorial.close();}});
const buttons = new Map([...root.querySelectorAll('[data-object]')].map(b => [b.dataset.object, b]));
let width = 0, height = 0, dpr = 1, scale = 1, camera = {...villageCenter}, frame = 0;
const tutorialPanel = $('tutorial'), tutorialSkip = $('tutorial-skip');
const tutorialHouse = places.find(p=>p.id==='induo-works'&&p.shape==='house');
const tutorial = createTutorial(step=>{
  tutorialStep=step;
  tutorialPanel.hidden=!step;
  $('tutorial-spotlight').hidden=!step;
  $('tutorial-gesture').hidden=!step;
  helpToggle.setAttribute('aria-expanded',String(Boolean(step)));
  buttons.forEach(b=>b.classList.remove('tutorial-target'));
  if(!step)return;
  const touch=matchMedia('(pointer: coarse)').matches;
  const gestureIcon=$('tutorial-gesture');
  gestureIcon.dataset.step=step;
  gestureIcon.textContent=step==='drag'?'↔️':step==='house'?'👇':step==='zoom'?(touch?'🤏':'🖱️'):'✨';
  $('tutorial-progress').textContent=step==='done'?'✓':(['drag','house','zoom'].indexOf(step)+1)+' / 3';
  $('tutorial-message').textContent=text.tutorial[step==='zoom'?(touch?'pinch':'wheel'):step];
  tutorialSkip.textContent=step==='done'?text.tutorial.finish:text.tutorial.skip;
  if(step==='house'&&tutorialHouse) {
    camera=toScreen(tutorialHouse.x,tutorialHouse.y); requestDraw();
    buttons.get(tutorialHouse.id)?.classList.add('tutorial-target');
  }
  requestDraw();
});
tutorialSkip.addEventListener('click',()=>{tutorial.close();canvas.focus({preventScroll:true});});
let playing = false, audio = null, master = null, timer = 0, note = 0, audioBusy = false;
const trees = [];
for (let tx = 1; tx < SIZE-1; tx++) for (let ty = 1; ty < SIZE-1; ty++) {
  if(noise(tx,ty,9)>.14)continue;
  const x=tx+(noise(tx,ty,10)-.5)*1.2,y=ty+(noise(tx,ty,11)-.5)*1.2;
  if(!(x<5||y<4||x>19||y>19)||isPond(x,y)||(x>8.5&&x<14.5&&y>=7))continue;
  if(places.some(p=>p.area==='village'&&(p.shape==='sign'?x<4.5&&y>5&&y<19:Math.abs(p.x-x)<2.5&&Math.abs(p.y-y)<2.5)))continue;
  if(trees.some(t=>Math.hypot(t.x-x,t.y-y)<2.3))continue;
  trees.push({x,y,size:.8+noise(tx,ty,12)*.35,draw:tree});
}
const objects = [...trees.map(t=>({...t,area:'village'})), ...places.map(p => ({...p, draw: {house, postSign, sign, board, game, jukebox, artwork}[p.shape]})), {x:9,y:10,draw:character,area:'village'}].sort((a,b)=>a.x+a.y-b.x-b.y);
function polygon(c, points, fill) { c.fillStyle = fill; c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fill(); }
function tile(c, x, y, color) { const p = toScreen(x,y); polygon(c, [[p.x,p.y-12],[p.x+24,p.y],[p.x,p.y+12],[p.x-24,p.y]], color); }
function box(c,x,y,w,d,h,colors) { polygon(c,[[x,y-h],[x+w,y+d-h],[x,y+2*d-h],[x-w,y+d-h]],colors[0]); polygon(c,[[x-w,y+d-h],[x,y+2*d-h],[x,y+2*d],[x-w,y+d]],colors[1]); polygon(c,[[x,y+2*d-h],[x+w,y+d-h],[x+w,y+d],[x,y+2*d]],colors[2]); }
function makeGround() {
  terrain.width = SIZE * 48 + 48; terrain.height = SIZE * 24 + 32;
  ground.translate(SIZE * 24, 16);
  polygon(ground, [[-24,0],[0,-12],[SIZE*24-24,(SIZE-1)*12],[0,SIZE*24-12],[-SIZE*24,(SIZE-1)*12]], '#899469');
  for (let sum = 0; sum < SIZE * 2; sum++) for (let x = 0; x < SIZE; x++) {
    const y = sum - x; if (y < 0 || y >= SIZE) continue;
    const water = isPond(x,y), path = isPath(x,y);
    tile(ground,x,y,water ? ((x+y)%2 ? '#82aca3' : '#8db6ad') : path ? '#e3c793' : ['#a6b77c','#a9b980','#acbc83'][Math.floor(noise(x,y)*3)]);
    const p = toScreen(x,y);
    if(path){
      const corners=[[p.x,p.y-12],[p.x+24,p.y],[p.x,p.y+12],[p.x-24,p.y]],neighbors=[[x,y-1],[x+1,y],[x,y+1],[x-1,y]];
      ground.strokeStyle='#aa8454';ground.lineWidth=1.5;ground.beginPath();
      neighbors.forEach(([nx,ny],i)=>{if(!isPath(nx,ny)){ground.moveTo(...corners[i]);ground.lineTo(...corners[(i+1)%4]);}});ground.stroke();
    }
    if (!path && !water && noise(Math.floor(x/3),Math.floor(y/3),4)<.55 && noise(x,y,1)<.28) {
      const tuft=toScreen(x+(noise(x,y,2)-.5)*.7,y+(noise(x,y,3)-.5)*.7);
      ground.fillStyle='#80965d';ground.fillRect(tuft.x,tuft.y-2,1.5,3);
      if(noise(x,y,5)<.35){ground.fillStyle='#efe2b0';ground.fillRect(tuft.x-1,tuft.y-4,2.5,2);}
    }
    if (water) { ground.fillStyle='#b7d2bf';ground.fillRect(p.x-8,p.y,14,1); }
  }
}
function house(c, object){
  box(c,0,-18,43,21,50,['#e8d3a1','#ddc18c','#bea877']);
  const roof=object.id==='induo-works'?['#456c92','#6088ac','#234567']:['#ad6245','#ca7b51','#98563d'];
  polygon(c,[[-43,-47],[0,-72],[43,-47],[0,-25]],roof[0]);polygon(c,[[-43,-47],[-43,-56],[0,-85],[0,-72]],roof[1]);polygon(c,[[0,-85],[43,-56],[43,-47],[0,-72]],roof[2]);
  // The door follows the right wall's isometric face.
  c.save(); c.transform(1,-21/43,0,1,0,-26);
  c.fillStyle='#705a3b';c.fillRect(12,19,15,31);c.fillStyle='#ead0a1';c.fillRect(15,35,2,2);c.restore();
  box(c,14,-69,5,3,16,['#d0b392','#ac8e76','#866d5d']);
}
function postSign(c,object) {
  c.save();c.transform(1,-.5,0,1,-28,-18);
  c.fillStyle='#745237';c.fillRect(26,16,4,24);
  c.fillStyle='#8d6543';c.fillRect(0,0,56,20);
  c.fillStyle='#c59c68';c.fillRect(2,2,52,16);
  c.fillStyle='#ae8657';c.fillRect(3,9,50,1);
  c.fillStyle='#59482f';c.font='600 8px system-ui, sans-serif';c.textAlign='center';c.fillText(object.title,28,13,48);
  c.fillStyle='#715539';c.fillRect(4,4,1,1);c.fillRect(51,15,1,1);c.restore();
}
function tree(c,object){c.save();c.scale(object.size,object.size);c.fillStyle='#7c7050';c.fillRect(-3,-13,6,19);polygon(c,[[-20,-12],[0,-51],[20,-12]],'#587b59');polygon(c,[[-16,-25],[0,-63],[16,-25]],'#719366');polygon(c,[[-11,-41],[0,-71],[11,-41]],'#8da773');c.restore();}
function sign(c,object) {
  c.save();c.font='700 34px system-ui, sans-serif';c.textBaseline='alphabetic';
  const letters=[...object.title.toUpperCase()],metrics=letters.map(letter=>c.measureText(letter));
  const {positions,width}=signLetterLayout(metrics),startX=-width/2,startY=width/4;
  const lettering=(dx=0,dy=0)=>letters.forEach((letter,i)=>c.fillText(letter,positions[i]+dx,dy));
  c.transform(1,-.5,0,1,startX,startY);
  c.fillStyle='#7c7050';metrics.forEach((m,i)=>c.fillRect(positions[i]+(m.actualBoundingBoxRight-m.actualBoundingBoxLeft)/2-1,0,2,9));
  c.fillStyle='#8c8a77';for(let depth=6;depth>0;depth--)lettering(-depth,-depth);
  c.fillStyle='#faefe5';lettering();c.restore();
}
function board(c,object) {
  polygon(c,[[-48,-44],[48,-92],[43,-94.5],[-53,-46.5]],'#c7aa7b');
  polygon(c,[[-48,-44],[-48,14],[-53,11.5],[-53,-46.5]],'#765437');
  c.save();c.transform(1,-.5,0,1,-48,-44);
  c.fillStyle='#705c40';c.fillRect(8,54,5,23);c.fillRect(84,54,5,23);
  c.fillStyle='#8c6543';c.fillRect(0,0,96,58);c.fillStyle='#b88c5b';c.fillRect(4,4,88,50);
  const papers=object.notes===1?[[24,8,48,42,'#f5e8c3']]:[[9,10,23,27,'#f5e8c3'],[37,8,20,21,'#d6dfbd'],[63,13,24,30,'#efe0b4'],[35,33,23,17,'#e1c6a0']];
  for (const [x,y,w,h,color] of papers.slice(0,object.notes||0)) {
    c.fillStyle=color;c.fillRect(x,y,w,h);c.fillStyle='#a25844';c.fillRect(x+w/2,y+2,2,2);c.fillStyle='#999476';c.fillRect(x+4,y+8,w-8,1);c.fillRect(x+4,y+12,w-10,1);
  }
  if(object.notes===1){c.fillStyle='#4c533b';c.font='700 8px system-ui, sans-serif';c.textAlign='center';c.fillText(object.noteTitle,48,31,40);}
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
  roomTerrain.width=600;roomTerrain.height=450;
  const c=roomTerrain.getContext('2d');c.translate(300,120);
  for(let sum=0;sum<20;sum++)for(let x=0;x<10;x++){const y=sum-x;if(y>=0&&y<10)tile(c,x,y,(x+y)%2?'#bf9c6d':'#caa978');}
  polygon(c,[[0,-102],[-240,18],[-240,108],[0,-12]],'#d7c79e');
  polygon(c,[[0,-102],[240,18],[240,108],[0,-12]],'#e7d8ad');
  polygon(c,[[-240,104],[0,-16],[0,-10],[-240,110]],'#9b805d');polygon(c,[[0,-16],[240,104],[240,110],[0,-10]],'#a78a62');
  c.fillStyle='#f2e6bd';c.beginPath();c.ellipse(0,145,67,25,0,0,Math.PI*2);c.fill();
}
function character(c){
  c.fillStyle='#425d3a35';c.beginPath();c.ellipse(0,3,10,4,0,0,Math.PI*2);c.fill();
  c.fillStyle='#e6ca89';c.fillRect(-7,-16,14,15);c.fillStyle='#e9d69b';c.fillRect(-9,-27,18,15);c.fillStyle='#ba8b57';c.fillRect(-11,-25,4,10);c.fillRect(7,-25,4,10);c.fillStyle='#314950';c.fillRect(-5,-23,2,2);c.fillRect(3,-23,2,2);c.fillRect(-2,-19,4,3);c.fillStyle='#476879';c.fillRect(-7,-12,14,4);c.fillStyle='#b58d4c';c.fillRect(-8,-29,16,3);c.fillStyle='#acbeac';c.fillRect(-6,-30,4,4);c.fillRect(2,-30,4,4);
}
function spriteBounds(object) { return object.shape==='sign'?[-168,-120,336,216]:[-64,-112,128,144]; }
function sprite(object, hover) {
  const key = object.id+':'+hover;
  if (sprites.has(key)) return sprites.get(key);
  const [left,top,w,h]=spriteBounds(object);
  const art = document.createElement('canvas');art.width=w*2;art.height=h*2;
  const c = art.getContext('2d');c.scale(2,2);c.translate(-left,-top);object.draw(c,object);
  if(object.interactive===false){sprites.set(key,art);return art;}
  const mask = document.createElement('canvas');mask.width=art.width;mask.height=art.height;
  const m = mask.getContext('2d');m.drawImage(art,0,0);m.globalCompositeOperation='source-in';m.fillStyle=hover?'#007f9f':'#725d3c';m.fillRect(0,0,art.width,art.height);
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
function requestDraw() { if (!frame) frame = requestAnimationFrame(draw); }
function draw() {
  frame = 0;
  const ox = width / 2 - camera.x * scale, oy = height / 2 - camera.y * scale + 30;
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,width,height);
  ctx.translate(ox,oy); ctx.scale(scale,scale);
  if(area==='room')ctx.drawImage(roomTerrain,-300,-120);else ctx.drawImage(terrain,-SIZE*24,-16);
  for (const object of objects) {
    if(object.area!==area||(area==='room'&&object.owner!==activeWorker?.id))continue;
    const p = toScreen(object.x,object.y), x = ox + p.x*scale, y = oy + p.y*scale;
    const bounds=spriteBounds(object),[left,top,w,h]=bounds;
    if (x+(left+w)*scale<0 || x+left*scale>width || y+(top+h)*scale<0 || y+top*scale>height) continue;
    ctx.save(); ctx.translate(p.x,p.y);
    if (object.id) { requestBadge(object);ctx.drawImage(sprite(object,hovered===object.id),...bounds); }
    else object.draw(ctx,object);
    ctx.restore();
  }
  for (const p of places) {
    const point = toScreen(p.x,p.y), b = buttons.get(p.id);if(!b)continue;
    if(p.area!==area||(area==='room'&&p.owner!==activeWorker?.id)){b.hidden=true;continue;}
    if(p.shape==='sign'){
      const x=ox+(point.x-148)*scale,y=oy+(point.y+40)*scale;
      b.hidden=x+296*scale<0||x>width||y+Math.max(44,50*scale)<0||y-148*scale>height;
      b.style.transformOrigin='0 0';b.style.transform='skewY(-26.565deg)';
      b.style.left=x+'px';b.style.top=y+'px';b.style.width=296*scale+'px';b.style.height=Math.max(44,50*scale)+'px';
      b.querySelector('span').style.transform='translateX(-50%) skewY(26.565deg)';continue;
    }
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
  positionPopup(); positionTutorial();
}
function positionPopup() {
  if(popup.hidden||!popupObject)return;
  const target=buttons.get(popupObject), r=scene.getBoundingClientRect(), b=target.getBoundingClientRect();
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
  if(tutorialStep==='house')focus=buttons.get(tutorialHouse.id).getBoundingClientRect();
  const spotlight=$('tutorial-spotlight'), icon=$('tutorial-gesture');
  spotlight.style.left=(focus.left-6)+'px';spotlight.style.top=(focus.top-6)+'px';
  spotlight.style.width=(focus.width+12)+'px';spotlight.style.height=(focus.height+12)+'px';
  icon.style.left=(tutorialStep==='house'?focus.left-r.left+focus.width/2:r.width/2)+'px';
  icon.style.top=(tutorialStep==='house'?focus.top-r.top-32:r.height*.58)+'px';
}
window.addEventListener('scroll',positionTutorial,{passive:true});
window.addEventListener('resize',positionTutorial);
new ResizeObserver(positionPopup).observe(popup);
function resize() {
  const r = canvas.getBoundingClientRect();
  if (!width) scale = defaultZoom(r.width,r.height,area);
  width = r.width; height = r.height; dpr = Math.min(devicePixelRatio || 1,1.5);
  canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr); requestDraw();
}
function changeArea(next) {
  if(next===area)return;
  if(next==='room') {savedVillage={camera:{...camera},scale};camera=toScreen(4.5,4.5);scale=defaultZoom(width,height,'room');if(!roomTerrain.width||roomTerrain.width===300)makeRoom();}
  else {camera=savedVillage?.camera||{...villageCenter};scale=savedVillage?.scale||defaultZoom(width,height);}
  area=next;hovered='';closePopup();
  $('back').hidden=area!=='room';$('caption').textContent=area==='room'?activeWorker.name.toUpperCase():text.title.toUpperCase();
  canvas.setAttribute('aria-label',area==='room'?activeWorker.name+' · '+text.room:text.title);
  pointers.clear();gesture=null;pinch=null;requestDraw();canvas.focus({preventScroll:true});
  if(matchMedia('(max-width: 639px)').matches)scene.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
$('back').addEventListener('click',()=>changeArea('village'));
function closePopup(restoreFocus = false) {
  popup.hidden = true;
  popupObject=null;
  buttons.forEach(b => b.setAttribute('aria-pressed','false'));
  if (restoreFocus && popupTrigger) popupTrigger.focus({preventScroll:true});
}
function visit(id, focusMap = false, trigger = null) {
  const p = places.find(p => p.id === id); if (!p) return;
  if(tutorialStep==='drag'||(tutorialStep==='house'&&id!==tutorialHouse.id))return;
  if(p.shape==='house'){activeWorker=workers.find(w=>w.id===id);changeArea('room');tutorial.complete('house');return;}
  if(!popup.hidden&&popupObject===id){closePopup(Boolean(trigger));return;}
  popupObject=id;
  popupTrigger = trigger || buttons.get(id);
  $('title').textContent = p.title; $('description').textContent = p.description;
  $('links').replaceChildren();
  for (const item of p.links || []) {
    const a = document.createElement('a'); a.textContent = item.title+' ↗'; a.href = item.href;
    if(new URL(a.href).origin!==location.origin){a.target='_blank';a.rel='noopener noreferrer';}
    $('links').append(a);
  }
  $('player').hidden = p.shape !== 'jukebox';
  $('gallery').replaceChildren();
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
  if(p.shape==='jukebox')void toggleMusic();
  buttons.forEach((b,key) => b.setAttribute('aria-pressed',String(key === id)));
  if (focusMap) { camera = clampCamera(toScreen(p.x,p.y),worldSize()); requestDraw(); }
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
for(const event of ['pointerup','pointercancel'])window.addEventListener(event,()=>{zoomPointer=false;});
zoomRange.addEventListener('input',()=>{
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
window.addEventListener('pointerup',finishGesture);
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
const melody = [60,64,67,72,71,67,64,62,60,64,69,67,64,62,60,null];
function scheduleNote() {
  const pitch = melody[note++%melody.length]; if (pitch === null) return;
  const voice=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
  voice.type='sine';voice.frequency.value=440*2**((pitch-69)/12);gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.35,now+.015);gain.gain.exponentialRampToValueAtTime(.001,now+.35);voice.connect(gain);gain.connect(master);voice.start(now);voice.stop(now+.4);voice.onended=()=>{voice.disconnect();gain.disconnect();};
}
function stopMusic() {
  sprites.clear();
  clearInterval(timer); timer=0; playing=false;
  if(audio && audio.state === 'running') void audio.suspend();
  $('stop').hidden=true; $('music').textContent=text.play; $('music').setAttribute('aria-pressed','false'); $('music-status').textContent='';requestDraw();
}
async function toggleMusic() {
  if(audioBusy) return; if(playing) { stopMusic();return; } audioBusy=true;
  try {
    if(!audio) { audio=new AudioContext();master=audio.createGain();master.gain.value=Number($('volume').value)/100;master.connect(audio.destination); }
    await audio.resume(); if(document.hidden) {stopMusic();return;}
    playing=true;sprites.clear();$('stop').hidden=false;scheduleNote();timer=setInterval(scheduleNote,420);$('music').textContent=text.stop;$('music').setAttribute('aria-pressed','true');$('music-status').textContent=text.music;requestDraw();
  } catch { $('music-status').textContent=text.error; } finally { audioBusy=false; }
}
$('stop').addEventListener('click',stopMusic);
$('music').addEventListener('click',() => void toggleMusic());
$('volume').addEventListener('input',() => {if(master) master.gain.value=Number($('volume').value)/100;});
document.addEventListener('visibilitychange',() => {if(document.hidden) {gesture=null;pinch=null;pointers.clear();scene.classList.remove('is-dragging');stopMusic();}});
window.addEventListener('pagehide',() => {clearInterval(timer);cancelAnimationFrame(frame);if(audio) void audio.close();});
makeGround();root.classList.add('ready');resize();new ResizeObserver(resize).observe(canvas);
const requestedWorker=new URLSearchParams(location.search).get('worker');
if(requestedWorker&&workers.some(w=>w.id===requestedWorker))visit(requestedWorker);
