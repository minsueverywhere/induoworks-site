// @ts-nocheck -- appended to the map module only during editor development.
import { objectPlacementError, paintError } from '/scripts/editor-placement.mjs';
import { MAX_DECORATIONS } from '/src/scripts/village-world.mjs';
let arranging=parent!==window,editorDrag=null,editorClick=false,editorTool='move',editorGrid=false,editorSelected='',editorCursor=null;
const sendEditor=data=>parent.postMessage({source:'induo-map',...data},location.origin);
const editorCatalog={...remoteContent,world:sceneWorld};
const editorPoint=event=>{const r=scene.getBoundingClientRect(),sx=(event.clientX-r.left-width/2)/scale+camera.x,sy=(event.clientY-r.top-height/2-30)/scale+camera.y;return{x:sx/48+sy/24,y:sy/24-sx/48};};
const editorId=o=>o.worldId||o.id;
function editorHit(event){
  const id=event.target.closest('[data-object]')?.dataset.object;
  if(id)return objects.find(o=>o.id===id&&o.area==='village');
  const point=editorPoint(event),screen=toScreen(point.x,point.y);
  return [...objects].reverse().find(o=>{if(!o.worldId)return false;const p=toScreen(o.x,o.y),w=o.type==='tree'?24*o.size:8,h=o.type==='tree'?75*o.size:o.type==='character'?38:12;return screen.x>=p.x-w&&screen.x<=p.x+w&&screen.y>=p.y-h&&screen.y<=p.y+8;});
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
  arranging=event.data.arranging!==false;editorTool=event.data.tool||'move';editorGrid=event.data.grid===true;requestDraw();
});
scene.addEventListener('pointerdown',event=>{
  if(!arranging||area!=='village'||event.button!==0||event.target.closest('#village-popup,[data-ui]'))return;
  const object=editorHit(event);if(editorTool==='move'&&!object)return;
  event.stopImmediatePropagation();event.preventDefault();scene.setPointerCapture(event.pointerId);editorClick=true;
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
  if(!editorDrag||event.pointerId!==editorDrag.pointerId)return;event.stopImmediatePropagation();editorDrag=null;
},true);
scene.addEventListener('pointerleave',()=>{editorCursor=null;requestDraw();});
scene.addEventListener('click',event=>{if(editorClick){event.stopImmediatePropagation();editorClick=false;}},true);
function drawEditorOverlay(){
  if(!arranging||area!=='village')return;
  ctx.save();ctx.lineWidth=1/scale;ctx.strokeStyle='#203745';ctx.globalAlpha=.2;
  const outline=(x,y)=>{const p=toScreen(x,y);ctx.beginPath();ctx.moveTo(p.x,p.y-12);ctx.lineTo(p.x+24,p.y);ctx.lineTo(p.x,p.y+12);ctx.lineTo(p.x-24,p.y);ctx.closePath();ctx.stroke();};
  if(editorGrid)for(let x=0;x<24;x++)for(let y=0;y<24;y++)outline(x,y);
  ctx.globalAlpha=1;ctx.lineWidth=2/scale;ctx.strokeStyle='#edcba9';
  const selected=objects.find(o=>editorId(o)===editorSelected);if(selected)outline(selected.x,selected.y);
  if(editorCursor&&editorTool!=='move')outline(Math.round(editorCursor.x),Math.round(editorCursor.y));
  ctx.restore();
}
root.dataset.editor='true';sendEditor({type:'ready'});
