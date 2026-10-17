// @ts-nocheck -- appended to the map module only during editor development.
import { objectPlacementError, paintError } from '/scripts/editor-placement.mjs';
import { MAX_DECORATIONS, houseFootprint } from '/src/scripts/village-world.mjs';
import { historyShortcut } from '/scripts/editor/history.mjs';
let arranging=parent!==window,editorDrag=null,editorClick=false,editorTool='move',editorGrid=false,editorSelected='',editorCursor=null;
const sendEditor=data=>parent.postMessage({source:'induo-map',...data},location.origin);
const editorCatalog={...remoteContent,world:sceneWorld};
const editorPoint=event=>{const r=scene.getBoundingClientRect(),sx=(event.clientX-r.left-width/2)/scale+camera.x,sy=(event.clientY-r.top-height/2-30)/scale+camera.y;return{x:sx/48+sy/24,y:sy/24-sx/48};};
const editorId=o=>o.worldId||o.id;
function editorHit(event){
  const id=event.target.closest('[data-object]')?.dataset.object;
  if(id)return objects.find(o=>o.id===id&&o.area==='village');
  const point=editorPoint(event),screen=toScreen(point.x,point.y);
  return [...objects].reverse().find(o=>{if(!o.worldId&&!(o.shape==='board'&&o.interactive===false))return false;const p=toScreen(o.x,o.y),w=o.shape==='board'?58:o.type==='tree'?24*o.size:8,h=o.shape==='board'?104:o.type==='tree'?75*o.size:o.type==='character'?38:12;return screen.x>=p.x-w&&screen.x<=p.x+w&&screen.y>=p.y-h&&screen.y<=p.y+8;});
}
function editorSelect(object){editorSelected=editorId(object);hovered=object.id||'';sendEditor({type:'select',id:editorSelected,kind:object.shape||object.type});requestDraw();}
function editorBrush(event){
  const raw=editorPoint(event),point={x:Math.round(raw.x),y:Math.round(raw.y)};
  if(['grass','path','water'].includes(editorTool)){
    const error=paintError(editorCatalog,point,editorTool);if(error){sendEditor({type:'hint',error});return;}
    const tile=sceneWorld.tiles[point.y*24+point.x];if(tile.type===editorTool)return;tile.type=editorTool;makeGround();requestDraw();sendEditor({type:'tile',...point,terrain:editorTool});
  }else if(editorTool==='erase'){
    const hit=editorHit(event);if(!hit?.worldId||!['tree','grass'].includes(hit.type))return;
    sceneWorld.decorations=sceneWorld.decorations.filter(d=>d.id!==hit.worldId);objects.splice(objects.indexOf(hit),1);sendEditor({type:'decorationRemove',id:hit.worldId});editorSelected='';requestDraw();
  }else if(['tree','tuft'].includes(editorTool)){
    if(sceneWorld.decorations.length>=MAX_DECORATIONS){sendEditor({type:'hint',error:'장식은 최대 '+MAX_DECORATIONS+'개까지 놓을 수 있어요.'});return;}
    const type=editorTool==='tree'?'tree':'grass',error=objectPlacementError(editorCatalog,type,'',point);
    if(error){sendEditor({type:'hint',error});return;}
    let n=1;while(sceneWorld.decorations.some(d=>d.id===type+'-'+n))n++;
    const object={id:type+'-'+n,type,...point,size:1};sceneWorld.decorations.push(object);objects.push(decorationObject(object));objects.sort((a,b)=>a.x+a.y-b.x-b.y);
    sendEditor({type:'decorationAdd',object});editorSelect(objects.find(o=>o.worldId===object.id));requestDraw();
  }
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.source!=='induo-editor')return;
  if(event.data.type==='restore'){editorSelected=event.data.selection||'';restoreEditorScene(event.data.catalog);return;}
  document.documentElement.dataset.theme=event.data.theme==='dark'?'dark':'light';
  arranging=event.data.arranging!==false;editorTool=event.data.tool||'move';editorGrid=event.data.grid===true;requestDraw();
});
scene.addEventListener('pointerdown',event=>{
  if(!arranging||area!=='village'||event.button!==0||event.target.closest('#village-popup,[data-ui]'))return;
  const object=editorHit(event);if(editorTool==='move'&&!object)return;
  event.stopImmediatePropagation();event.preventDefault();scene.setPointerCapture(event.pointerId);editorClick=true;
  canvas.focus({preventScroll:true});
  sendEditor({type:'begin'});
  if(editorTool==='move'){editorSelect(object);editorDrag={object,id:editorId(object),kind:object.shape||object.type,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:object.x,y:object.y};}
  else{editorDrag={brush:true,pointerId:event.pointerId};editorBrush(event);}
},true);
scene.addEventListener('pointermove',event=>{
  if(arranging&&area==='village'){editorCursor=editorPoint(event);requestDraw();}
  if(!editorDrag||event.pointerId!==editorDrag.pointerId)return;
  event.stopImmediatePropagation();
  if(editorDrag.brush){if(['grass','path','water','erase'].includes(editorTool))editorBrush(event);return;}
  const d=editorDrag,dx=(event.clientX-d.startX)/scale,dy=(event.clientY-d.startY)/scale,snap=d.kind==='house'?1:4;
  const point={x:Math.round((d.x+dx/48+dy/24)*snap)/snap,y:Math.round((d.y+dy/24-dx/48)*snap)/snap};
  const error=objectPlacementError(editorCatalog,d.kind,d.id,point);if(error){sendEditor({type:'hint',error});return;}
  Object.assign(d.object,point);
  if(d.kind==='house'){Object.assign(places.find(p=>p.id===d.id),point);Object.assign(editorCatalog.workers.find(w=>w.id===d.id).house,point);}
  else if(d.id==='welcome'||d.id==='noticeboard'){Object.assign(d.id==='welcome'?sceneWorld.sign:sceneWorld.noticeboard,point);Object.assign(places.find(p=>p.id===d.id),point);}
  else if(d.id==='mascot')Object.assign(sceneWorld.mascot,point);
  else Object.assign(sceneWorld.decorations.find(o=>o.id===d.id),point);
  objects.sort((a,b)=>a.x+a.y-b.x-b.y);requestDraw();sendEditor({type:'move',id:d.id,kind:d.kind,...point});
},true);
for(const type of ['pointerup','pointercancel','lostpointercapture'])scene.addEventListener(type,event=>{
  if(!editorDrag||event.pointerId!==editorDrag.pointerId)return;event.stopImmediatePropagation();editorDrag=null;sendEditor({type:'end'});
},true);
scene.addEventListener('pointerleave',()=>{editorCursor=null;requestDraw();});
scene.addEventListener('click',event=>{if(editorClick){event.stopImmediatePropagation();editorClick=false;}},true);
function drawEditorOverlay(){
  if(!arranging||area!=='village')return;
  ctx.save();ctx.lineWidth=1/scale;ctx.strokeStyle='#203745';ctx.globalAlpha=.2;
  const outline=(x,y)=>{const p=toScreen(x,y);ctx.beginPath();ctx.moveTo(p.x,p.y-12);ctx.lineTo(p.x+24,p.y);ctx.lineTo(p.x,p.y+12);ctx.lineTo(p.x-24,p.y);ctx.closePath();ctx.stroke();};
  if(editorGrid)for(let x=0;x<24;x++)for(let y=0;y<24;y++)outline(x,y);
  ctx.globalAlpha=1;ctx.lineWidth=2/scale;ctx.strokeStyle='#edcba9';
  const selected=objects.find(o=>editorId(o)===editorSelected);
  if(selected?.shape==='house'){
    const lot=houseFootprint(editorCatalog.workers.find(w=>w.id===selected.id).house);
    ctx.fillStyle='#edcba9';
    for(let y=lot.y;y<lot.y+lot.depth;y++)for(let x=lot.x;x<lot.x+lot.width;x++){ctx.globalAlpha=.2;tile(ctx,x,y,'#edcba9');ctx.globalAlpha=1;outline(x,y);}
  }else if(selected)outline(selected.x,selected.y);
  if(editorCursor&&editorTool!=='move')outline(Math.round(editorCursor.x),Math.round(editorCursor.y));
  ctx.restore();
}
function restoreEditorScene(catalog){
  editorDrag=null;closePopup();
  const data=villageContent(catalog,document.documentElement.lang.startsWith('ko')?'ko':'en',text.title);
  Object.assign(editorCatalog,catalog);Object.assign(sceneWorld,data.world);editorCatalog.world=sceneWorld;
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
  objects.splice(0,objects.length,...sceneWorld.decorations.map(decorationObject),...places.map(p=>({...p,draw:{house,sign,board,game,jukebox,artwork}[p.shape]})),{...sceneWorld.mascot,worldId:'mascot',type:'character',draw:character,area:'village'});
  objects.sort((a,b)=>a.x+a.y-b.x-b.y);sprites.clear();makeGround();requestDraw();
}
window.addEventListener('keydown',event=>{const action=historyShortcut(event);if(action){event.preventDefault();sendEditor({type:'history',action});}});
window.addEventListener('blur',()=>{if(editorDrag){editorDrag=null;sendEditor({type:'end'});}});
if(parent!==window){
  const style=document.createElement('style');style.textContent=`
    body>header,body>footer,.village-heading,body>.skip-link,astro-dev-toolbar{display:none!important}
    html,body{height:100%;min-height:0;overflow:hidden}body>main{display:flex;min-height:0;padding:0!important}
    #village-section{width:100%;max-width:none;height:100dvh;min-height:0;margin:0;padding:0;display:flex;flex-direction:column}
    #village-scene{flex:1;min-height:0;border:0;border-radius:0}
  `;document.head.append(style);
}
root.dataset.editor='true';sendEditor({type:'ready'});
