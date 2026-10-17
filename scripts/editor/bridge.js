// @ts-nocheck -- appended to the map module only during editor development.
import { objectPlacementError, paintError, placementObjects, placementCells, roomCatalog } from '/scripts/editor-placement.mjs';
import { MAX_DECORATIONS, setTerrain } from '/src/scripts/village-world.mjs';
import { historyShortcut } from '/scripts/editor/history.mjs';
let arranging=parent!==window,editorDrag=null,editorClick=false,editorTool='move',editorGrid=false,editorSelected='',editorCursor=null,editorCandidate=null;
let editorLetter='A',editorColor='#faefe5',editorExhibit='music:legacy';
let roomEditing=false,hostArranging=parent!==window,roomPanel=null,panelOwner=null,roomTool='move';
const editorSpace=()=>area==='room'?roomCatalog(editorCatalog,activeWorker.id,roomLevel):editorCatalog;
const editorWorld=()=>area==='room'?currentRoom():sceneWorld;
function ensureEditorRoom(){if(area!=='room')return;const w=editorCatalog.workers.find(w=>w.id===activeWorker.id);w.room??={floors:structuredClone(roomFloors(w))};activeWorker.room=w.room;}
const editorKind=o=>o.editType||o.shape||o.type;
const editorVisible=o=>o.area===area&&(area!=='room'||(o.owner===activeWorker.id&&(o.floor||0)===roomLevel));
const sendEditor=data=>{if(data.type==='area')updateRoomPanel(data.owner);parent.postMessage({source:'induo-map',...data},location.origin);};
const editorCatalog={...remoteContent,world:sceneWorld};
const editorPoint=event=>{const r=scene.getBoundingClientRect(),sx=(event.clientX-r.left-width/2)/scale+camera.x,sy=(event.clientY-r.top-height/2-30)/scale+camera.y;return area==='room'?roomPoint({x:sx,y:sy},activeWorker,roomLevel):{x:sx/48+sy/24,y:sy/24-sx/48};};
const editorId=o=>o.worldId||o.id;
function editorHit(event){
  const id=event.target.closest('[data-object]')?.dataset.object;
  if(id)return objects.find(o=>o.id===id&&editorVisible(o)&&(area==='village'||o.editType==='exhibit'));
  const point=editorPoint(event),screen=area==='room'?roomScreen(point,activeWorker,roomLevel):toScreen(point.x,point.y);
  return [...objects].reverse().find(o=>{if(!editorVisible(o)||(!o.worldId&&!(o.shape==='board'&&o.interactive===false)))return false;const p=objectScreen(o),w=o.shape==='board'?58:o.type==='tree'?24*o.size:o.type==='letter'?20:8,h=o.shape==='board'?104:o.type==='tree'?75*o.size:o.type==='character'?38:o.type==='letter'?50:12;return screen.x>=p.x-w&&screen.x<=p.x+w&&screen.y>=p.y-h&&screen.y<=p.y+8;});
}
function editorSelect(object){editorSelected=editorId(object);hovered=object.id||'';sendEditor({type:'select',id:editorSelected,kind:editorKind(object)});requestDraw();}
function editorBrush(event){
  ensureEditorRoom();const space=editorSpace(),world=editorWorld();
  const raw=editorPoint(event),point={x:Math.round(raw.x),y:Math.round(raw.y)};
  if(['grass','path','water','floor','empty'].includes(editorTool)){
    const error=editorPaintError(point,editorTool);if(error){sendEditor({type:'hint',error});return;}
    if((terrainAt(world,point.x,point.y)||'empty')===editorTool)return;setTerrain(world,point.x,point.y,editorTool);if(area==='room')makeRoom();else makeGround();requestDraw();sendEditor({type:'tile',...point,terrain:editorTool,owner:area==='room'?activeWorker.id:null,level:roomLevel});
  }else if(editorTool==='erase'){
    const hit=editorHit(event);if(hit?.editType==='exhibit'){world.exhibits=world.exhibits.filter(e=>e.id!==hit.worldId);objects.splice(objects.indexOf(hit),1);places.splice(places.findIndex(p=>p.id===hit.id),1);buttons.get(hit.id)?.remove();buttons.delete(hit.id);sendEditor({type:'exhibitRemove',id:hit.worldId,owner:area==='room'?activeWorker.id:null,level:roomLevel});requestDraw();return;}if(!hit?.worldId||!['tree','grass','letter'].includes(hit.type))return;
    sceneWorld.decorations=sceneWorld.decorations.filter(d=>d.id!==hit.worldId);objects.splice(objects.indexOf(hit),1);sendEditor({type:'decorationRemove',id:hit.worldId});editorSelected='';requestDraw();
  }else if(editorTool==='exhibit'){
    world.exhibits??=[];if(world.exhibits.length>=100){sendEditor({type:'hint',error:'전시물은 한 공간에 100개까지 놓을 수 있어요.'});return;}
    const error=objectPlacementError(space,'exhibit','',point);if(error){sendEditor({type:'hint',error});return;}
    let n=1;while(world.exhibits.some(e=>e.id==='exhibit-'+n))n++;const [kind,ref]=editorExhibit.split(':');
    const object={id:'exhibit-'+n,kind,ref,...point,width:1,depth:1};world.exhibits.push(object);sendEditor({type:'exhibitAdd',object,owner:area==='room'?activeWorker.id:null,level:roomLevel});restoreEditorScene(editorCatalog);editorSelected=object.id;sendEditor({type:'select',id:object.id,kind:'exhibit'});
  }else if(area==='village'&&['tree','tuft','letter'].includes(editorTool)){
    if(sceneWorld.decorations.length>=MAX_DECORATIONS){sendEditor({type:'hint',error:'장식은 최대 '+MAX_DECORATIONS+'개까지 놓을 수 있어요.'});return;}
    const type=editorTool==='tree'?'tree':editorTool==='letter'?'letter':'grass',error=objectPlacementError(editorCatalog,type,'',{...point,...(type==='tree'?{width:2,depth:2}:{})});
    if(error){sendEditor({type:'hint',error});return;}
    let n=1;while(sceneWorld.decorations.some(d=>d.id===type+'-'+n))n++;
    const object={id:type+'-'+n,type,...point,size:1,...(type==='tree'?{width:2,depth:2}:type==='letter'?{width:1,depth:1,char:editorLetter,color:editorColor}:{})};sceneWorld.decorations.push(object);objects.push(decorationObject(object));objects.sort((a,b)=>a.x+a.y-b.x-b.y);
    sendEditor({type:'decorationAdd',object});editorSelect(objects.find(o=>o.worldId===object.id));requestDraw();
  }
}
life.on(window,'message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.source!=='induo-editor')return;
  if(event.data.type==='leaveRoom'){changeArea('village');return;}
  if(event.data.type==='enterRoom'){activeWorker=workers.find(w=>w.id===event.data.owner);if(activeWorker){changeArea('room');setRoomLevel(event.data.level||0);}return;}
  if(event.data.type==='restore'){editorSelected=event.data.selection||'';restoreEditorScene(event.data.catalog);return;}
  if(event.data.type==='roomControls'){updateRoomControls(event.data);return;}
  document.documentElement.dataset.theme=event.data.theme==='dark'?'dark':'light';
  editorCandidate=null;
  hostArranging=event.data.arranging!==false;
  if(area==='village'){editorExhibit=event.data.exhibit||'music:legacy';editorTool=event.data.tool||'move';editorGrid=event.data.grid===true;}
  editorLetter=/^[A-Z0-9]$/.test(event.data.char)?event.data.char:'A';editorColor=/^#[0-9a-fA-F]{6}$/.test(event.data.color)?event.data.color:'#faefe5';arranging=area==='room'?roomEditing:hostArranging;requestDraw();
});
scene.addEventListener('pointerdown',event=>{
  if(!arranging||event.button!==0||event.target.closest('#village-popup,[data-ui]'))return;
  const object=editorHit(event);if(editorTool==='move'&&!object)return;if(area==='room'&&!['move','floor','empty','exhibit','erase'].includes(editorTool))return;
  event.stopImmediatePropagation();event.preventDefault();scene.setPointerCapture(event.pointerId);editorClick=true;
  canvas.focus({preventScroll:true});
  sendEditor({type:'begin'});
  if(editorTool==='move'){editorSelect(object);editorDrag={object,id:editorId(object),kind:editorKind(object),pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:object.x,y:object.y};}
  else{editorDrag={brush:true,pointerId:event.pointerId};editorBrush(event);}
},true);
scene.addEventListener('pointermove',event=>{
  if(arranging){editorCursor=editorPoint(event);requestDraw();}
  if(!editorDrag||event.pointerId!==editorDrag.pointerId)return;
  event.stopImmediatePropagation();
  if(editorDrag.brush){if(['grass','path','water','floor','empty','erase'].includes(editorTool))editorBrush(event);return;}
  const d=editorDrag,dx=(event.clientX-d.startX)/scale,dy=(event.clientY-d.startY)/scale,snap=['house','board','tree','letter','exhibit'].includes(d.kind)?1:4;
  const point={x:Math.round((d.x+dx/48+dy/24)*snap)/snap,y:Math.round((d.y+dy/24-dx/48)*snap)/snap};
  editorCandidate={type:d.kind,id:d.id,point};
  const error=objectPlacementError(editorSpace(),d.kind,d.id,point);if(error){sendEditor({type:'hint',error});return;}
  Object.assign(d.object,point);
  const ground=groundPosition({...placementObjects(editorSpace()).find(o=>o.id===d.id)?.point,...point},d.kind);d.object.ground=ground;
  if(d.kind==='exhibit'){Object.assign(editorWorld().exhibits.find(e=>e.id===d.id),point);Object.assign(places.find(p=>p.id===d.object.id),point,{ground});}
  else if(d.kind==='house'){Object.assign(places.find(p=>p.id===d.id),point,{ground});Object.assign(editorCatalog.workers.find(w=>w.id===d.id).house,point);}
  else if(d.id==='welcome'||d.id==='noticeboard'){Object.assign(d.id==='welcome'?sceneWorld.sign:sceneWorld.noticeboard,point);Object.assign(places.find(p=>p.id===d.id),point,{ground});}
  else if(d.id==='mascot')Object.assign(sceneWorld.mascot,point);
  else Object.assign(sceneWorld.decorations.find(o=>o.id===d.id),point);
  objects.sort((a,b)=>a.x+a.y-b.x-b.y);requestDraw();sendEditor({type:'move',id:d.id,kind:d.kind,...point,owner:area==='room'?activeWorker.id:null,level:roomLevel});
},true);
for(const type of ['pointerup','pointercancel','lostpointercapture'])scene.addEventListener(type,event=>{
  if(!editorDrag||event.pointerId!==editorDrag.pointerId)return;event.stopImmediatePropagation();editorDrag=null;editorCandidate=null;requestDraw();sendEditor({type:'end'});
},true);
scene.addEventListener('pointerleave',()=>{editorCursor=null;if(!editorDrag)editorCandidate=null;requestDraw();});
scene.addEventListener('click',event=>{if(editorClick){event.stopImmediatePropagation();editorClick=false;}},true);
function editorPaintError(point,type){
  if(area==='room'&&!['floor','empty'].includes(type))return '실내에서는 바닥 도구를 사용해 주세요.';
  if(area==='village'&&type==='floor')return '바닥 도구는 실내에서 사용해 주세요.';
  if(area==='room'&&type==='empty'&&places.some(p=>p.area==='room'&&p.owner===activeWorker.id&&(p.floor||0)===roomLevel&&Math.round(p.x)===point.x&&Math.round(p.y)===point.y))return '전시물 아래 바닥은 남겨주세요.';
  return paintError(editorSpace(),point,type);
}
function drawEditorOverlay(drawingRoomLevel=0){
  if(!arranging||(area==='room'&&drawingRoomLevel!==roomLevel))return;
  ctx.save();if(area==='room')ctx.translate(0,-roomElevation(activeWorker,roomLevel));ctx.lineWidth=1/scale;ctx.strokeStyle='#203745';ctx.globalAlpha=.2;
  const outline=(x,y)=>{const p=toScreen(x,y);ctx.beginPath();ctx.moveTo(p.x,p.y-12);ctx.lineTo(p.x+24,p.y);ctx.lineTo(p.x,p.y+12);ctx.lineTo(p.x-24,p.y);ctx.closePath();ctx.stroke();};
  if(editorGrid){const b=terrainBounds(editorWorld(),3);for(let x=b.minX;x<=b.maxX;x++)for(let y=b.minY;y<=b.maxY;y++)outline(x,y);}
  ctx.lineWidth=2/scale;
  let candidate=editorCandidate;
  if(!candidate&&editorCursor&&['tree','tuft','letter','exhibit'].includes(editorTool))candidate={type:editorTool==='tree'?'tree':editorTool==='letter'?'letter':editorTool==='exhibit'?'exhibit':'grass',id:'',point:{x:Math.round(editorCursor.x),y:Math.round(editorCursor.y),...(editorTool==='tree'?{width:2,depth:2}:{})}};
  if(!candidate&&(!editorCursor||editorTool==='move'))candidate=placementObjects(editorSpace()).find(o=>o.id===editorSelected);
  let cells=candidate?placementCells(editorSpace(),candidate.type,candidate.id,candidate.point):[];
  if(editorCursor&&['grass','path','water','floor','empty'].includes(editorTool)){
    const x=Math.round(editorCursor.x),y=Math.round(editorCursor.y);
    cells=[{x,y,error:editorPaintError({x,y},editorTool)}];
  }
  for(const cell of cells){
    const color=cell.error?'#ed625d':'#edcba9';ctx.globalAlpha=cell.error ? .4 : .2;tile(ctx,cell.x,cell.y,color);
    ctx.globalAlpha=1;ctx.strokeStyle=color;outline(cell.x,cell.y);
  }
  if(!cells.length&&editorCursor&&editorTool==='erase'){ctx.globalAlpha=1;ctx.strokeStyle='#edcba9';outline(Math.round(editorCursor.x),Math.round(editorCursor.y));}
  ctx.restore();
}
function restoreEditorScene(catalog){
  editorDrag=null;editorCandidate=null;editorCursor=null;closePopup();
  applyVillageCatalog(catalog);Object.assign(editorCatalog,catalog);editorCatalog.world=sceneWorld;
}
life.on(window,'keydown',event=>{const action=historyShortcut(event);if(action){event.preventDefault();sendEditor({type:'history',action});}});
life.on(window,'blur',()=>{if(editorDrag){editorDrag=null;editorCandidate=null;requestDraw();sendEditor({type:'end'});}});
function updateRoomPanel(owner){
  if(!roomPanel)return;
  if(panelOwner!==owner){roomEditing=false;roomTool='move';editorSelected='';editorCursor=null;editorCandidate=null;}
  panelOwner=owner||null;roomPanel.hidden=!owner;
  arranging=owner?roomEditing:hostArranging;
  if(owner){editorTool=roomTool;editorGrid=roomEditing;}
  roomPanel.querySelector('[data-room-toggle]').setAttribute('aria-pressed',String(roomEditing));
  roomPanel.querySelector('[data-room-toggle]').textContent=roomEditing?'꾸미기 마침':'꾸미기';
  roomPanel.querySelector('[data-room-tools]').hidden=!roomEditing;
  closePopup();requestDraw();
}
function updateRoomControls(state){
  if(!roomPanel)return;
  updateRoomPanel(state.owner);
  roomPanel.querySelector('[data-room-label]').textContent=(state.name||'')+' · '+(state.level+1)+'층';
  const wall=roomPanel.querySelector('[data-room-wall]');if(document.activeElement!==wall)wall.value=String(state.wallHeight);
  const choice=roomPanel.querySelector('[data-room-exhibit]'),value=choice.value;
  choice.replaceChildren(...state.choices.map(([id,title])=>new Option(title,id)));
  if([...choice.options].some(o=>o.value===value))choice.value=value;
  editorExhibit=choice.value;
  const selected=roomPanel.querySelector('[data-room-selection]');selected.hidden=!state.selected;
  const reference=selected.querySelector('[data-room-reference]');reference.replaceChildren(...state.choices.map(([id,title])=>new Option(title,id)));if(state.selected)reference.value=state.selected.kind+':'+state.selected.ref;
  for(const key of ['width','depth','flip']){const input=selected.querySelector('[data-room-property='+key+']');if(document.activeElement!==input){if(key==='flip')input.checked=state.selected?.flip===true;else input.value=String(state.selected?.[key]||1);}}
  roomPanel.querySelectorAll('button,input,select').forEach(el=>el.disabled=state.busy);
  roomPanel.querySelector('[data-room-action=add-floor]').disabled=state.busy||state.count>=3;
  roomPanel.querySelector('[data-room-action=remove-floor]').disabled=state.busy||state.level===0;
}
if(parent!==window){
  roomPanel=document.createElement('section');roomPanel.dataset.ui='';roomPanel.className='room-decorating';roomPanel.hidden=true;roomPanel.setAttribute('aria-label','내 작업실 꾸미기');
  roomPanel.innerHTML=`<div class="room-decorating-head"><strong data-room-label></strong><button type="button" data-room-toggle aria-pressed="false">꾸미기</button></div>
    <div data-room-tools hidden><p>로컬 체험 · 현재 집 내부만 꾸밉니다. 저장·배포는 호스트 편집기에서 합니다.</p>
    <div role="toolbar" aria-label="실내 꾸미기 도구"><button data-room-tool="move" aria-label="전시물 이동" title="전시물 이동" aria-pressed="true">↖</button><button data-room-tool="floor" aria-label="바닥 확장" title="바닥 확장" aria-pressed="false">▦</button><button data-room-tool="empty" aria-label="바닥 지우기" title="바닥 지우기" aria-pressed="false">▱</button><button data-room-tool="exhibit" aria-label="전시물 놓기" title="전시물 놓기" aria-pressed="false">▣</button><button data-room-tool="erase" aria-label="전시물 지우기" title="전시물 지우기" aria-pressed="false">⌫</button><button data-room-history="undo" aria-label="실행 취소">↶</button><button data-room-history="redo" aria-label="다시 실행">↷</button></div>
    <label>전시할 작품·이미지·음악 <select data-room-exhibit></select></label>
    <div data-room-selection hidden><strong>선택한 전시물</strong><label>전시 항목 <select data-room-reference></select></label><label>점유 너비 <input data-room-property="width" type="number" min="1" max="24" step="1"></label><label>점유 깊이 <input data-room-property="depth" type="number" min="1" max="24" step="1"></label><label><input data-room-property="flip" type="checkbox">좌우 반전</label></div>
    <label>벽 높이 <input data-room-wall type="number" min="24" max="240" step="1"></label>
    <div><button data-room-action="add-floor">층 추가</button><button data-room-action="remove-floor">현재 층 삭제</button></div></div>`;
  scene.append(roomPanel);
  roomPanel.addEventListener('click',event=>{
    if(event.target.closest('[data-room-toggle]')){roomEditing=!roomEditing;updateRoomPanel(panelOwner);return;}
    const tool=event.target.closest('[data-room-tool]');
    if(tool){roomTool=editorTool=tool.dataset.roomTool;roomPanel.querySelectorAll('[data-room-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b===tool)));editorCandidate=null;requestDraw();}
    const action=event.target.closest('[data-room-action]');if(action)sendEditor({type:'roomAction',owner:activeWorker.id,action:action.dataset.roomAction});
    const history=event.target.closest('[data-room-history]');if(history)sendEditor({type:'history',action:history.dataset.roomHistory});
  });
  roomPanel.querySelector('[data-room-exhibit]').addEventListener('change',event=>{editorExhibit=event.target.value;roomTool=editorTool='exhibit';roomPanel.querySelectorAll('[data-room-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.roomTool==='exhibit')));requestDraw();});
  const wall=roomPanel.querySelector('[data-room-wall]');
  wall.addEventListener('focus',()=>sendEditor({type:'begin'}));wall.addEventListener('blur',()=>sendEditor({type:'end'}));
  wall.addEventListener('input',()=>sendEditor({type:'roomAction',owner:activeWorker.id,action:'wall-height',value:Number(wall.value)}));
  roomPanel.querySelectorAll('[data-room-property]').forEach(input=>input.addEventListener('change',()=>sendEditor({type:'roomAction',owner:activeWorker.id,action:'placement',value:{key:input.dataset.roomProperty,value:input.type==='checkbox'?input.checked:Number(input.value)}})));
  roomPanel.querySelector('[data-room-reference]').addEventListener('change',event=>sendEditor({type:'roomAction',owner:activeWorker.id,action:'reference',value:event.target.value}));
  const style=document.createElement('style');style.textContent=`
    body>header,body>footer,.village-heading,body>.skip-link,astro-dev-toolbar{display:none!important}
    html,body{height:100%;min-height:0;overflow:hidden}body>main{display:flex;min-height:0;padding:0!important}
    #village-section{width:100%;max-width:none;height:100dvh;min-height:0;margin:0;padding:0;display:flex;flex-direction:column}
    #village-scene{flex:1;min-height:0;border:0;border-radius:0}
    .room-decorating{position:absolute;z-index:8;top:12px;right:12px;max-width:min(300px,calc(100% - 90px));max-height:calc(100% - 72px);overflow:auto;padding:10px;background:var(--color-bg);color:var(--color-text);border:1px solid var(--color-border);border-radius:6px;font:12px system-ui}
    .room-decorating-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.room-decorating p{font-size:11px;color:var(--color-text-muted);margin:8px 0}
    .room-decorating button,.room-decorating input,.room-decorating select{font:inherit;color:inherit;background:var(--color-bg-elevated);border:1px solid var(--color-border);border-radius:4px;min-height:36px;padding:5px 8px}
    .room-decorating [role=toolbar]{display:flex;gap:4px;flex-wrap:wrap}.room-decorating [aria-pressed=true]{outline:2px solid var(--color-accent)}
    .room-decorating label{display:flex;align-items:center;gap:8px;margin:10px 0}.room-decorating select{min-width:0;width:100%}.room-decorating input{width:76px}.room-decorating [hidden]{display:none!important}
  `;document.head.append(style);
}
root.dataset.editor='true';root.dataset.editorEmbedded=String(parent!==window);sendEditor({type:'ready'});
