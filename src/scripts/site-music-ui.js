import {musicPosition,musicDock} from './music-position.mjs';
import {siteMusic} from './site-music.mjs';
import {musicTime} from './village-music.mjs';
import {musicArtist} from './village-tracks.mjs';
import {fitMarquee} from './marquee.mjs';
const root=document.getElementById('site-music'),el=id=>document.getElementById('site-music-'+id);
let position=null,dock='',drag=null,suppressClick=false;
const size=()=>({width:root.offsetWidth,height:root.offsetHeight});
function place(point=position){
  if(root.hidden)return;
  if(dock)root.dataset.dock=dock;else delete root.dataset.dock;
  const box=size();position=musicPosition(point||{x:(innerWidth-box.width)/2,y:innerHeight-box.height-10},box,{width:innerWidth,height:innerHeight},dock);
  root.style.left=position.x+'px';root.style.top=position.y+'px';root.style.bottom='auto';root.style.transform='none';
}
function labels(){
  const ko=document.documentElement.lang.startsWith('ko');
  el('handle').setAttribute('aria-label',dock?(ko?'음악 플레이어 꺼내기':'Restore music player'):(ko?'드래그로 이동 · 누르면 가장자리에 숨기기':'Drag to move; click to tuck away'));
  el('handle').title=el('handle').getAttribute('aria-label');
}

function render(data=siteMusic.snapshot()){
  const ko=document.documentElement.lang.startsWith('ko'),playing=data.state==='playing';
  const inVillage=Boolean(document.getElementById('village-section'));
  const wasHidden=root.hidden;root.hidden=!data.visible||inVillage;if(wasHidden&&!root.hidden){place();requestAnimationFrame(()=>fitMarquee(el('work')));}document.body.classList.toggle('has-site-music',!root.hidden);
  root.setAttribute('aria-label',ko?'음악 플레이어':'Music player');
  if(!data.track)return;
  const title=data.track.title+' — '+musicArtist(data.track);
  if(el('work').firstElementChild.textContent!==title){el('work').firstElementChild.textContent=title;if(!root.hidden)fitMarquee(el('work'));}
  el('toggle').dataset.loading=String(data.state==='loading');el('toggle').setAttribute('aria-label',playing?(ko?'일시정지':'Pause'):(ko?'재생':'Play'));el('toggle').setAttribute('aria-pressed',String(playing));
  labels();
  const track=el('track');track.setAttribute('aria-label',(ko?'재생 위치 · ':'Playback position · ')+title);track.setAttribute('aria-valuemax',String(data.duration||1));track.setAttribute('aria-valuenow',String(data.current));
  track.setAttribute('aria-valuetext',musicTime(data.current)+' / '+musicTime(data.duration));track.style.setProperty('--progress',(data.duration?Math.min(100,data.current/data.duration*100):0)+'%');
  const message=data.state==='error'?(ko?'음악을 재생하지 못했습니다. 다시 눌러 주세요.':'Could not play music. Please retry.'):data.state==='loading'?(ko?'음악을 불러오는 중':'Loading music'):'';
  if(el('status').textContent!==message)el('status').textContent=message;
}
// Phones show this on the lock screen and media notification instead of guessing from the page.
let sessionTrack;
function syncMediaSession(data){
  const session=navigator.mediaSession;if(!session||typeof MediaMetadata==='undefined')return;
  session.playbackState=data.state==='playing'?'playing':data.visible?'paused':'none';
  if(data.track===sessionTrack)return;sessionTrack=data.track;
  session.metadata=data.track?new MediaMetadata({title:data.track.title,artist:musicArtist(data.track),album:data.track.project?data.track.project+' Soundtrack':'Induo Works',artwork:[{src:'/brand/dewy-icon-512.png',sizes:'512x512',type:'image/png'}]}):null;
}
if(navigator.mediaSession){
  const actions={play:()=>{if(siteMusic.snapshot().state!=='playing')void siteMusic.toggle();},pause:()=>siteMusic.pause(),stop:()=>siteMusic.close(),seekto:details=>siteMusic.seek(details.seekTime)};
  for(const [action,handler]of Object.entries(actions))try{navigator.mediaSession.setActionHandler(action,handler);}catch{/* Unsupported actions are optional. */}
}
siteMusic.subscribe(render);siteMusic.subscribe(syncMediaSession);document.addEventListener('astro:page-load',()=>{render();place();});
el('toggle').addEventListener('click',()=>void siteMusic.toggle());
let seeking=null;
function seekAt(event){const {duration}=siteMusic.snapshot();if(!duration)return;const r=el('track').getBoundingClientRect();siteMusic.seek(Math.max(0,Math.min(1,(event.clientX-r.left)/r.width))*duration);}
el('track').addEventListener('pointerdown',event=>{if(event.button!==0)return;seeking=event.pointerId;el('track').setPointerCapture(event.pointerId);seekAt(event);});
el('track').addEventListener('pointermove',event=>{if(seeking===event.pointerId)seekAt(event);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])el('track').addEventListener(type,()=>{seeking=null;});
el('track').addEventListener('keydown',event=>{
  const {current,duration}=siteMusic.snapshot(),next={ArrowLeft:current-5,ArrowRight:current+5,Home:0,End:duration-1}[event.key];
  if(next===undefined||!duration)return;event.preventDefault();siteMusic.seek(Math.max(0,Math.min(duration,next)));
});
window.addEventListener('resize',()=>place());
el('handle').addEventListener('click',()=>{
  if(suppressClick){suppressClick=false;return;}
  const side=dock;dock=side?'':position.x+size().width/2<innerWidth/2?'left':'right';
  place(side?{x:side==='left'?10:innerWidth-size().width-10,y:position.y}:position);labels();
});
el('handle').addEventListener('pointerdown',event=>{
  if(event.button!==0||event.isPrimary===false)return;
  root.dataset.dragging='true';suppressClick=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY,start:{...position},moved:false,side:dock};el('handle').setPointerCapture(event.pointerId);
});
el('handle').addEventListener('pointermove',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<6)return;
  drag.moved=true;dock='';const point={x:drag.start.x+dx,y:drag.start.y+dy},edge=musicDock(point,size(),innerWidth);if(edge)root.dataset.drop=edge;else delete root.dataset.drop;place(point);
});
function endDrag(event){
  if(!drag||drag.id!==event.pointerId)return;
  if(event.type==='pointercancel'||event.type==='lostpointercapture'){dock=drag.side;place(drag.start);}
  else if(drag.moved){dock=musicDock({x:drag.start.x+event.clientX-drag.x,y:position.y},size(),innerWidth);place();}
  delete root.dataset.dragging;delete root.dataset.drop;suppressClick=drag.moved;drag=null;labels();
}
el('handle').addEventListener('lostpointercapture',endDrag);el('handle').addEventListener('pointerup',endDrag);el('handle').addEventListener('pointercancel',endDrag);
el('handle').addEventListener('keydown',event=>{
  const offsets={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]},delta=offsets[event.key];if(!delta)return;
  event.preventDefault();dock='';place({x:position.x+delta[0],y:position.y+delta[1]});labels();
});
