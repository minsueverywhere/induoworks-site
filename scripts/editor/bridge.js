// @ts-nocheck -- appended to the map module only during editor development.
import { placementError } from '/scripts/editor-placement.mjs';
let arranging=parent!==window,editorDrag=null,editorClick=false;
const sendEditor=data=>parent.postMessage({source:'induo-map',...data},location.origin);
const editorWorkers=remoteContent.workers;
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.source!=='induo-editor')return;
  arranging=event.data.arranging!==false;
});
scene.addEventListener('pointerdown',event=>{
  if(!arranging||area!=='village'||event.button!==0)return;
  const id=event.target.closest('[data-object]')?.dataset.object,object=objects.find(p=>p.id===id&&p.shape==='house');
  if(!object)return;
  event.stopImmediatePropagation();event.preventDefault();scene.setPointerCapture(event.pointerId);
  editorDrag={object,id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:object.x,y:object.y};editorClick=true;
  hovered=id;requestDraw();sendEditor({type:'select',id});
},true);
scene.addEventListener('pointermove',event=>{
  if(!editorDrag||event.pointerId!==editorDrag.pointerId)return;
  event.stopImmediatePropagation();
  const d=editorDrag,dx=(event.clientX-d.startX)/scale,dy=(event.clientY-d.startY)/scale;
  const point={x:Math.round(d.x+dx/48+dy/24),y:Math.round(d.y+dy/24-dx/48)};
  const error=placementError(editorWorkers,d.id,point);
  if(error){sendEditor({type:'hint',error});return;}
  Object.assign(d.object,point);Object.assign(places.find(p=>p.id===d.id),point);Object.assign(editorWorkers.find(w=>w.id===d.id).house,point);
  for(const object of objects)if(!object.id&&object.draw===tree)object.editorHidden=places.some(p=>p.shape==='house'&&Math.abs(p.x-object.x)<2.5&&Math.abs(p.y-object.y)<2.5);
  objects.sort((a,b)=>a.x+a.y-b.x-b.y);requestDraw();sendEditor({type:'move',id:d.id,...point});
},true);
for(const type of ['pointerup','pointercancel'])scene.addEventListener(type,event=>{
  if(!editorDrag||event.pointerId!==editorDrag.pointerId)return;event.stopImmediatePropagation();editorDrag=null;
},true);
scene.addEventListener('click',event=>{if(editorClick){event.stopImmediatePropagation();editorClick=false;}},true);
root.dataset.editor='true';
sendEditor({type:'ready'});
