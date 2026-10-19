import {soundtrackChoices} from './village-tracks.mjs';
import './village-participant.css';
import {createHistory,historyShortcut} from '../../scripts/editor/history.mjs';
import {villageSlice,mergeVillage} from '../server/studio-village-layout.mjs';
import {placementObjects,objectPlacementError,placementCells,paintError} from '../../scripts/editor-placement.mjs';
import {setTerrain,terrainAt,terrainBounds} from './village-world.mjs';
import {toScreen} from './village-camera.mjs';
export function createVillageEditor(api){
  const panel=document.createElement('section');panel.className='participant-studio';panel.dataset.ui='';panel.dataset.room='true';panel.hidden=true;panel.setAttribute('aria-label','마을 편집');api.scene.append(panel);
  const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;},status=node('p'),body=node('div');body.className='participant-body';status.setAttribute('role','status');panel.append(status,body);
  const history=createHistory();let approved,layout,model,revision=0,saved='',busy=false,tool='move',tiles=false,objectsOpen=false,workOpen=false,objectKind='tree',selected='',cursor,gesture,suppress=false,lastSave=0,closing;
  const paths={undo:'M4 10h9a7 7 0 0 1 7 7M4 10l5-5M4 10l5 5',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',work:'M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h6',place:'m12 3 9 5v9l-9 5-9-5V8Zm-9 5 9 5 9-5M12 13v9',tree:'m12 2 7 10h-4l6 7H3l6-7H5ZM12 19v4',sign:'M3 4h18v10H3ZM12 14v8M7 8h10',project:'m5 3 14 7v10L5 13ZM8 15v5m8-1v3M5 21l7 3 7-3',music:'m3 9 9-5 9 5v9l-9 5-9-5Zm0 0 9 5 9-5M12 14v9M8 9a4 2 0 1 0 8 0 4 2 0 1 0-8 0',move:'m4 3 7 17 2-7 7-2Z',tile:'m12 4 9 5-9 5-9-5Zm-4 3 8 4',grass:'m3 17 5-7 4 5 5-9 4 11M3 20h18',path:'M8 3 5 21M16 3l3 18M11 6h2m-2 6h2m-2 6h2',water:'M3 8q3-3 6 0t6 0 6 0M3 15q3-3 6 0t6 0 6 0',empty:'m4 8 8-5 8 5-8 5Zm3 10h10',flip:'M12 3v18M3 17l6-10v10Zm18 0L15 7v10Z'};
  const choices=kind=>kind==='project'?approved.projects.map(p=>[p.slug,p.title.ko||p.slug]):kind==='media'?approved.media.map(m=>[m.id,m.title.ko||m.id]):[['legacy',approved.music.title],...(approved.tracks||[]).map(t=>[t.id,t.title])];
  const kinds=[['tree','나무'],['grass','풀'],['sign','간판'],['project','전시대'],['music','주크박스']];
  const labels={place:'물건 놓기',move:'선택·이동',grass:'잔디 타일',path:'길 타일',water:'물 타일',empty:'타일 제거'};
  const listen=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,...(api.signal?{signal:api.signal}:{})});
  const active=()=>!panel.hidden&&!busy&&api.state().area==='village';
  const dirty=()=>layout&&JSON.stringify(layout)!==saved;
  const objects=()=>placementObjects(model),current=()=>objects().find(o=>o.type+':'+o.id===selected);
  const preview=()=>{model=mergeVillage(approved,layout);api.applyLayout(layout);};
  const changed=()=>{preview();history.record(layout);status.textContent='편집을 마치면 자동 저장됩니다.';};
  async function request(data){
    if(api.preview){if(!data)return {catalog:api.catalog,payload:villageSlice(api.catalog),revision:0};throw Error('미리보기에서는 저장하지 않습니다.');}
    const response=await fetch('/api/studio/village',{signal:AbortSignal.timeout(15000),...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{cache:'no-store'})}),result=await response.json();if(!response.ok)throw Error(result.error);return result;
  }
  function icon(parent,key,label,action,pressed){const b=node('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',paths[key]);svg.append(path);b.append(svg,node('span',label));listen(b,'click',action);parent.append(b);return b;}
  function render(){
    body.replaceChildren();api.scene.dataset.placing=String(tool==='place'&&!panel.hidden);api.editorUI?.(labels[tool],!panel.hidden);const bar=node('div');bar.className='participant-tools';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','마을 편집 도구');body.append(bar);
    icon(bar,'move','선택·이동',()=>{tool='move';tiles=false;objectsOpen=false;workOpen=false;selected='';render();api.requestDraw();},tool==='move');
    icon(bar,'place','물건 놓기',()=>{tool='place';selected='';tiles=false;workOpen=false;objectsOpen=!objectsOpen;render();api.requestDraw();},tool==='place');
    icon(bar,'tile','마을 타일',()=>{if(['move','place'].includes(tool))tool='grass';selected='';objectsOpen=false;workOpen=false;tiles=!tiles;render();api.requestDraw();},!['move','place'].includes(tool));
    icon(bar,'undo','실행 취소',()=>undo());
    if(objectsOpen){const row=node('div');row.className='participant-subtools';row.setAttribute('role','toolbar');row.setAttribute('aria-label','물건 종류');body.append(row);for(const [id,label]of kinds)icon(row,id,label,()=>{objectKind=id;objectsOpen=false;render();api.requestDraw();},objectKind===id);}
    if(tiles){const row=node('div');row.className='participant-subtools';row.setAttribute('role','toolbar');row.setAttribute('aria-label','마을 타일 종류');body.append(row);for(const id of ['grass','path','water','empty'])icon(row,id,labels[id],()=>{tool=id;render();api.requestDraw();},tool===id);}
    const item=current();if(item&&tool==='move'){
      const row=node('div');row.className='participant-subtools';body.append(row);
      if(item.type==='sign'&&item.id!=='welcome'){
        const input=node('input');input.value=item.point.title||'';input.maxLength=40;input.placeholder='간판 글씨';input.setAttribute('aria-label','간판 글씨');row.append(input);listen(input,'focus',()=>history.begin());listen(input,'blur',()=>history.end(layout));listen(input,'input',()=>mutate(()=>{target(item).title=input.value;changed();}));
      }
      if(item.type==='exhibit'){
        const title=choices(item.point.kind).find(([id])=>id===item.point.ref)?.[1]||(item.point.kind==='music'?'곡 선택':'작품 선택');const choose=icon(row,item.point.kind==='music'?'music':'work',item.point.kind==='music'?'곡 선택':'작품 선택',()=>{workOpen=!workOpen;render();});choose.className='participant-reference';choose.children[1].textContent=title;choose.setAttribute('aria-expanded',String(workOpen));
        if(workOpen){const list=node('div');list.className='participant-work-picker';list.setAttribute('aria-label','연결할 Work');body.append(list);const groups=item.point.kind==='music'?soundtrackChoices(approved,choices(item.point.kind)):[{choices:choices(item.point.kind)}];for(const group of groups){let target=list;if(group.title){target=node('details');target.append(node('summary',group.title+' Soundtrack'));list.append(target);}for(const [id,title]of group.choices){const b=node('button',title);b.type='button';b.setAttribute('aria-pressed',String(item.point.ref===id));listen(b,'click',()=>mutate(()=>{target(item).ref=id;workOpen=false;changed();render();}));target.append(b);}}}
      }
      icon(row,'flip','좌우 반전',()=>mutate(()=>{const next={...item.point,flip:!item.point.flip},error=objectPlacementError(model,item.type,item.id,next);if(error)throw Error(error);Object.assign(target(item),next);changed();render();api.requestDraw();}),!!item.point.flip);
      if(['tree','grass','letter','sign','exhibit'].includes(item.type)&&item.id!=='welcome')icon(row,'trash','삭제',()=>mutate(()=>{if(item.type==='exhibit')layout.world.exhibits=layout.world.exhibits.filter(e=>e.id!==item.id);else layout.world.decorations=layout.world.decorations.filter(d=>d.id!==item.id);selected='';workOpen=false;changed();render();api.requestDraw();}));
    }

  }
  const target=item=>item.type==='house'?layout.houses.find(w=>w.id===item.id).house:item.type==='board'?layout.world.noticeboard:item.type==='sign'?layout.world.sign:item.type==='character'?layout.world.mascot:item.type==='exhibit'?layout.world.exhibits.find(e=>e.id===item.id):layout.world.decorations.find(e=>e.id===item.id);
  function mutate(fn){const before=structuredClone(layout);try{fn();}catch(error){layout=before;status.textContent=error.message;}}
  function paint(event){const p=api.point(event),point={x:Math.round(p.x),y:Math.round(p.y)};
    if(tool==='place'){const type=['project','music'].includes(objectKind)?'exhibit':objectKind,error=objectPlacementError(model,type,'',point);if(error){status.textContent=error;return;}const id='placed-'+crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8,'0'),item={id,...point,width:1,depth:1};if(type==='exhibit'){const ref=choices(objectKind)[0]?.[0];if(!ref)throw Error('등록된 Work가 없습니다.');layout.world.exhibits??=[];layout.world.exhibits.push({...item,kind:objectKind,ref});}else layout.world.decorations.push({...item,type,size:1,...(type==='sign'?{title:'간판'}:{})});selected=type+':'+id;tool='move';objectsOpen=false;workOpen=type==='exhibit';changed();render();return;}
    const error=paintError(model,point,tool);if(error){status.textContent=error;return;}if((terrainAt(layout.world,point.x,point.y)||'empty')===tool)return;setTerrain(layout.world,point.x,point.y,tool);changed();}
  const end=()=>{if(gesture){gesture=null;history.end(layout);api.requestDraw();}};
  listen(api.scene,'pointerdown',event=>{
    if(!active()||event.isPrimary===false||event.button!==0||event.target.closest('[data-ui],#village-popup'))return;
    const id=api.pickVillage(event),item=objects().find(o=>o.id===id);if(tool==='move'&&!item)return;
    event.preventDefault();event.stopImmediatePropagation();api.scene.setPointerCapture(event.pointerId);history.begin();suppress=true;
    gesture={pointer:event.pointerId,placing:tool==='place',item:tool==='move'?item:null,point:api.point(event),startX:event.clientX,startY:event.clientY,x:item?.point.x,y:item?.point.y};
    if(tool==='move'){selected=item.type+':'+item.id;workOpen=false;render();}else if(tool==='place')cursor=api.point(event);else mutate(()=>paint(event));api.requestDraw();
  },{capture:true});
  listen(api.scene,'pointermove',event=>{
    if(!active())return;cursor=api.point(event);api.requestDraw();if(!gesture||event.pointerId!==gesture.pointer)return;event.stopImmediatePropagation();
    mutate(()=>{if(gesture.placing)return;if(tool!=='move'){if(tool!=='place')paint(event);return;}if(!gesture.item||Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)<6)return;
      const item=gesture.item,point={x:Math.round(gesture.x+cursor.x-gesture.point.x),y:Math.round(gesture.y+cursor.y-gesture.point.y)},error=objectPlacementError(model,item.type,item.id,point);if(error){status.textContent=error;return;}Object.assign(target(item),point);changed();});
  },{capture:true});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(api.scene,type,event=>{if(gesture){event.stopImmediatePropagation();if(type==='pointerup'&&gesture.placing)mutate(()=>paint(event));end();}},{capture:true});
  listen(api.scene,'click',event=>{if(suppress){suppress=false;if(!event.target.closest('[data-ui]'))event.stopImmediatePropagation();}},{capture:true});
  listen(api.scene,'pointerleave',()=>{cursor=null;api.requestDraw();});listen(window,'blur',end);
  function undo(action='undo'){if(busy)return;const next=history[action](layout);if(next){layout=next;preview();selected='';render();api.requestDraw();}}
  listen(window,'keydown',event=>{if(!active())return;const action=historyShortcut(event);if(action){event.preventDefault();undo(action);}else if(event.key==='Escape'){event.preventDefault();void close();}});
  listen(window,'beforeunload',event=>{if(!api.preview&&dirty())event.preventDefault();});
  listen(document,'astro:before-preparation',event=>{if(panel.hidden||api.preview||!dirty())return;const loader=event.loader;event.loader=async()=>{if(await close())await loader();else event.preventDefault();};});
  async function close(){
    if(closing)return closing;end();busy=true;
    closing=(async()=>{try{if(!api.preview&&dirty()){status.textContent='저장 중…';const remaining=5000-(Date.now()-lastSave);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));const snapshot=JSON.stringify(layout),result=await request({layout,revision});revision=result.revision;saved=snapshot;lastSave=Date.now();}panel.hidden=true;selected='';api.scene.dataset.placing='false';api.scene.classList.toggle('is-decorating',false);api.editorUI?.('',false);api.onClose?.();api.requestDraw();return true;}catch(error){status.textContent=error.message;return false;}finally{busy=false;}})().finally(()=>closing=null);return closing;
  }
  return {get isOpen(){return !panel.hidden;},get isEditing(){return active();},close,undo,async open(){if(!api.identity?.host)throw Error('호스트만 마을을 편집할 수 있습니다.');if(!layout||!dirty()){const data=await request();approved=data.catalog;layout=data.payload;revision=data.revision;saved=JSON.stringify(layout);history.reset(layout);preview();}selected='';tool='move';tiles=false;objectsOpen=false;workOpen=false;panel.hidden=false;api.scene.classList.toggle('is-decorating',true);status.textContent=api.preview?'미리보기 · 저장되지 않음':'편집을 마치면 자동 저장됩니다.';api.closePopup();api.onOpen?.();render();},draw(){
    if(!active())return;const c=api.ctx;c.save();c.lineWidth=1/api.state().scale;
    const outline=(x,y,color)=>{const p=toScreen(x,y);c.beginPath();c.moveTo(p.x,p.y-12);c.lineTo(p.x+24,p.y);c.lineTo(p.x,p.y+12);c.lineTo(p.x-24,p.y);c.closePath();c.strokeStyle=color;c.stroke();};
    const b=terrainBounds(layout.world,3);c.globalAlpha=.15;for(let x=b.minX;x<=b.maxX;x++)for(let y=b.minY;y<=b.maxY;y++)outline(x,y,'#203745');c.globalAlpha=1;
    if(tool==='move'){const item=current();if(item)for(const cell of placementCells(model,item.type,item.id,item.point))outline(cell.x,cell.y,cell.error?'#ed625d':'#edcba9');}else if(cursor){const p={x:Math.round(cursor.x),y:Math.round(cursor.y)};outline(p.x,p.y,(tool==='place'?objectPlacementError(model,['project','music'].includes(objectKind)?'exhibit':objectKind,'',p):paintError(model,p,tool))?'#ed625d':'#edcba9');}if(tool==='place'&&cursor){const p={x:Math.round(cursor.x),y:Math.round(cursor.y)},type=['project','music'].includes(objectKind)?'exhibit':objectKind;api.previewPlacement?.(objectKind,p,['project','music'].includes(objectKind)?choices(objectKind)[0]?.[0]:undefined,!objectPlacementError(model,type,'',p));}c.restore();
  }};
}
