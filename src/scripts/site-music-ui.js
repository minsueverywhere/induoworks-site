import {musicPosition,musicDock} from './music-position.mjs';
import {siteMusic} from './site-music.mjs';
import {musicTime} from './village-music.mjs';
import {musicArtist,musicWorkPath} from './village-tracks.mjs';
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
  const ko=document.documentElement.lang.startsWith('ko'),open=root.dataset.open==='true';
  el('expand').setAttribute('aria-label',open?(ko?'플레이어 접기':'Collapse player'):(ko?'플레이어 펼치기':'Expand player'));
  el('handle').setAttribute('aria-label',dock?(ko?'음악 플레이어 꺼내기':'Restore music player'):(ko?'드래그로 이동 · 누르면 가장자리에 숨기기':'Drag to move; click to tuck away'));
  el('handle').title=el('handle').getAttribute('aria-label');
}

function render(data=siteMusic.snapshot()){
  const ko=document.documentElement.lang.startsWith('ko'),playing=data.state==='playing';
  const inVillage=Boolean(document.getElementById('village-section'));
  const wasHidden=root.hidden;root.hidden=!data.visible||inVillage;if(wasHidden&&!root.hidden)place();document.body.classList.toggle('has-site-music',!root.hidden);
  root.setAttribute('aria-label',ko?'음악 플레이어':'Music player');
  if(!data.track)return;
  el('work').textContent=data.track.title+' — '+musicArtist(data.track);el('work').href=musicWorkPath(data.track,ko?'ko':'en');
  el('toggle').dataset.loading=String(data.state==='loading');el('toggle').setAttribute('aria-label',playing?(ko?'일시정지':'Pause'):(ko?'재생':'Play'));el('toggle').setAttribute('aria-pressed',String(playing));
  labels();el('close').setAttribute('aria-label',ko?'음악 정지·닫기':'Stop and close music');
  el('seek').setAttribute('aria-label',ko?'재생 위치':'Playback position');el('seek').max=String(data.duration||1);el('seek').value=String(data.current);el('seek').disabled=!data.duration;
  el('seek').setAttribute('aria-valuetext',musicTime(data.current)+' / '+musicTime(data.duration));el('time').textContent=musicTime(data.current)+' / '+musicTime(data.duration);
  const message=data.state==='error'?(ko?'음악을 재생하지 못했습니다. 다시 눌러 주세요.':'Could not play music. Please retry.'):data.state==='loading'?(ko?'음악을 불러오는 중':'Loading music'):'';
  if(el('status').textContent!==message)el('status').textContent=message;
}
siteMusic.subscribe(render);document.addEventListener('astro:page-load',()=>{render();place();});
el('toggle').addEventListener('click',()=>void siteMusic.toggle());el('close').addEventListener('click',()=>siteMusic.close());
el('seek').addEventListener('input',()=>siteMusic.seek(Number(el('seek').value)));
el('expand').addEventListener('click',()=>{const open=root.dataset.open!=='true';root.dataset.open=String(open);el('expand').setAttribute('aria-expanded',String(open));el('details').hidden=!open;place();labels();});
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
