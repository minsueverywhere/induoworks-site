import './village-participant.css';
import {villageContent} from './village-content.mjs';
import {createHistory,historyShortcut} from '../../scripts/editor/history.mjs';
import {studioSlice,mergeStudio} from '../server/studio-content.mjs';
import {CONTENT_ORIGIN,resolveMedia} from '../content-schema.mjs';
import {roomCatalog,objectPlacementError,paintError,placementObjects,placementCells} from '../../scripts/editor-placement.mjs';
import {setTerrain,terrainAt,groundPosition,terrainBounds} from './village-world.mjs';
import {toScreen} from './village-camera.mjs';
import {roomElevation} from './village-room.mjs';

export async function createParticipantEditor(api){
  const panel=document.createElement('section');panel.className='participant-studio';panel.dataset.ui='';panel.setAttribute('aria-label','내 작업실');api.scene.append(panel);
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const status=node('p');status.setAttribute('role','status');
  const top=node('details');top.className='participant-top';top.append(node('summary','계정'));panel.append(top,status);
  const listen=(target,type,fn)=>target.addEventListener(type,fn,api.signal?{signal:api.signal}:undefined);
  const body=node('div');body.className='participant-body';panel.append(body);
  const confirmation=node('dialog');confirmation.className='participant-confirm';confirmation.setAttribute('aria-label','층 삭제 확인');panel.append(confirmation);
  let identity,owner='',approved,payload,revision=0,stale=false,editing=false,tool='move',selected='',cursor=null,gesture=null,saved='',busy=false,sheet='';
  const history=createHistory();let model,placementCache=null,closing,lastSavedAt=0;
  const toolLabels={move:'선택·이동',exhibit:'작품 놓기',floor:'타일 놓기',transparent:'투명 타일',empty:'타일 지우기',erase:'전시물 지우기'};
  const placement=()=>{if(!placementCache||placementCache.level!==state().level)placementCache={level:state().level,space:roomCatalog(model,owner,state().level)};return placementCache.space;};
  const state=()=>api.state(),floor=()=>payload.room.floors[state().level];
  const inRoom=()=>state().area==='room'&&state().worker?.id===owner;
  const active=()=>editing&&inRoom()&&!busy&&!panel.hidden;
  const message=text=>{status.textContent=text;};
  async function request(action,data){
    if(api.preview){
      if(action==='session')return {host:false,owners:api.catalog.workers.filter(w=>w.house).map(w=>w.id)};
      if(action==='room'&&!data)return {catalog:structuredClone(api.catalog),payload:studioSlice(api.catalog,owner),baseHash:'preview',revision:0,stale:false};
      throw Error('미리보기에서는 저장·검토 요청을 하지 않습니다.');
    }
    const response=await fetch('/api/studio/'+action+(owner?'?owner='+encodeURIComponent(owner):''),data?{signal:AbortSignal.timeout(15000),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{cache:'no-store'});
    const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'요청을 처리하지 못했습니다.'),{status:response.status});return result;
  }
  const preview=()=>{model=mergeStudio(approved,owner,payload);placementCache=null;api.apply(resolveMedia(model,CONTENT_ORIGIN));};
  function changed(){preview();history.record(payload);message('편집을 마치면 자동 저장됩니다.');}
  function travel(action){if(busy)return;const next=history[action](payload);if(next){payload=next;preview();if(state().level>=payload.room.floors.length)api.enter(owner,payload.room.floors.length-1);render();api.requestDraw();}}
  const dirty=()=>payload&&JSON.stringify(payload)!==saved;
  listen(window,'beforeunload',event=>{if(!api.preview&&dirty())event.preventDefault();});
  async function persist(){
    if(api.preview||!dirty())return;
    message('저장 중…');
    const remaining=5000-(Date.now()-lastSavedAt);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
    const snapshot=JSON.stringify(payload),result=await request('room',{revision,room:payload.room});
    revision=result.revision;saved=snapshot;lastSavedAt=Date.now();message('저장됨');
  }
  function closeStudio(){
    if(closing)return closing;
    if(busy)return Promise.resolve(false);
    end();confirmation.close();
    closing=task(async()=>{
      await persist();panel.hidden=true;editing=false;api.onClose?.();api.scene.classList.toggle('is-decorating',false);api.editorUI?.('',false);api.updateFloors?.();api.canvas.focus({preventScroll:true});api.requestDraw();return true;
    }).then(result=>result===true).finally(()=>{closing=null;});
    return closing;
  }
  listen(document,'astro:before-preparation',event=>{
    if(api.preview||!dirty())return;
    const loader=event.loader;
    event.loader=async()=>{if(await closeStudio())await loader();else event.preventDefault();};
  });
  async function task(action){if(busy)return;busy=true;[...panel.querySelectorAll('button,input,select,textarea'),...(api.floorBar?.querySelectorAll('button,input')||[])].forEach(el=>el.disabled=true);try{return await action();}catch(error){message(error.message);}finally{busy=false;[...panel.querySelectorAll('button,input,select,textarea'),...(api.floorBar?.querySelectorAll('button,input')||[])].forEach(el=>el.disabled=false);}}
  function button(parent,label,action){const el=node('button',label);el.type='button';el.addEventListener('click',action);parent.append(el);return el;}
  function field(parent,label,value,update,options){
    const wrap=node('label'),caption=node('span',label),input=node(options?'select':'input');
    if(options){for(const [id,text] of options)input.append(new Option(text,id));input.value=String(value??'');}else input.value=String(value??'');
    input.addEventListener('focus',()=>history.begin());input.addEventListener('blur',()=>history.end(payload));
    input.addEventListener(options?'change':'input',()=>{const before=structuredClone(payload);try{update(input.value);changed();}catch(error){if(options){payload=before;render();}else history.record(payload);message(error.message);}});
    wrap.append(caption,input);parent.append(wrap);return input;
  }
  const allChoices=()=>{
    const own=item=>item.workerIds?.length===1&&item.workerIds.includes(owner);
    return [...approved.projects.filter(own).map(p=>['project:'+p.slug,p.title.ko||p.slug]),...approved.media.filter(own).map(m=>['media:'+m.id,m.title.ko||m.id]),...(own(approved.music)?[['music:legacy',approved.music.title]]:[]),...(approved.tracks||[]).filter(own).map(t=>['music:'+t.id,t.title])];
  };
  let reference='';
  const paths={move:'m4 3 7 17 2-7 7-2Z',exhibit:'M4 20V4h16v16ZM8 14l3-3 5 5M8 8h.01',floor:'m12 4 9 5-9 5-9-5Zm-4.5 2.5 9 5m-9 0 9-5',empty:'m4 8 8-5 8 5-8 5Zm3 10h10',erase:'m4 14 9-10 7 7-9 10H7Zm6 7h11',transparent:'m3 12 9-5 9 5-9 5Zm4-2 10 4',plus:'M12 5v14M5 12h14',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7'};
  function icon(parent,label,key,action){
    const b=button(parent,'',action);b.title=label;b.setAttribute('aria-label',label);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',paths[key]);svg.append(path);b.append(svg);return b;
  }
  function renderFloors(){
    if(!api.floorBar||!editing||panel.hidden||!inRoom())return false;
    const bar=api.floorBar;bar.hidden=false;bar.replaceChildren();
    payload.room.floors.forEach((_,level)=>{
      const row=node('div');row.className='floor-row';bar.append(row);
      const b=button(row,(level+1)+'층',()=>{api.enter(owner,level);render();});b.setAttribute('aria-pressed',String(state().level===level));
      if(level!==state().level)return;
      const input=node('input');input.type='number';input.min='24';input.max='240';input.value=String(floor().wallHeight);input.setAttribute('aria-label','벽 높이');input.title='벽 높이';row.append(input);
      input.addEventListener('change',()=>{const n=Number(input.value);if(!Number.isInteger(n)||n<24||n>240){message('벽 높이는 24–240입니다.');input.value=String(floor().wallHeight);return;}floor().wallHeight=n;changed();});
      if(level===0)return;
      const remove=icon(row,'층 삭제','trash',()=>{
        confirmation.replaceChildren();
        confirmation.append(node('p',(level+1)+'층을 삭제할까요?'),node('p','이 층의 바닥과 전시 배치가 함께 제거됩니다.'));
        const actions=node('div');confirmation.append(actions);
        const cancel=button(actions,'취소',()=>confirmation.close());
        button(actions,'삭제',()=>{confirmation.close();payload.room.floors.splice(level,1);changed();api.enter(owner,Math.min(level,payload.room.floors.length-1));render();});
        confirmation.showModal();cancel.focus();
      });remove.className='floor-delete';
    });
    if(payload.room.floors.length<3)icon(bar,'층 추가','plus',()=>{payload.room.floors.push({wallHeight:90,tiles:[{x:0,y:0,type:'floor'}],exhibits:[]});changed();api.enter(owner,payload.room.floors.length-1);render();});
    return true;
  }
  function render(){
    if(!payload)return;body.replaceChildren();editing=inRoom();panel.dataset.room=String(editing);api.scene.classList.toggle('is-decorating',editing&&!panel.hidden);api.editorUI?.(toolLabels[tool],editing&&!panel.hidden);renderFloors();
    const detail=(label,key)=>{const box=node('details');box.className='participant-sheet participant-'+key;box.open=sheet===key;box.append(node('summary',label));body.append(box);return box;};
    if(stale){body.append(node('p','승인본이 바뀌었습니다. 변경안을 내려받아 호스트에게 전달해 주세요.'));}
    if(!inRoom())button(body,'작업실로 이동',()=>{api.enter(owner);render();});
    else{
      const tools=node('div');tools.className='participant-tools';tools.setAttribute('role','toolbar');tools.setAttribute('aria-label','작업실 편집 도구');body.append(tools);
      for(const [id,label] of [['move','선택·이동'],['exhibit','작품 놓기'],['floor','타일 놓기'],['transparent','투명 타일'],['empty','타일 지우기'],['erase','전시물 지우기']]){
        const b=icon(tools,label,id,()=>{tool=id;sheet=id==='exhibit'?'choices':'';render();api.requestDraw();});b.setAttribute('aria-pressed',String(tool===id));
      }
      const choices=detail('내 작품','choices'),options=allChoices();
      if(!options.some(([id])=>id===reference))reference=options[0]?.[0]||'';
      if(options.length){
        const list=node('div');list.className='participant-work-list';choices.append(list);
        for(const [id,title] of options){const b=button(list,title,()=>{reference=id;tool='exhibit';sheet='';render();api.requestDraw();});b.setAttribute('aria-pressed',String(reference===id));}
      }else choices.append(node('p','등록된 작품이 없습니다. 먼저 Works에 작품을 등록해 주세요.'));
      const item=floor().exhibits.find(e=>e.id===selected);
      if(item){const props=detail('선택한 작품','selection');for(const [key,label] of [['width','너비'],['depth','깊이']]){const input=field(props,label,item[key],value=>{const next={...item,[key]:Number(value)},error=objectPlacementError(placement(),'exhibit',item.id,next);if(error)throw Error(error);Object.assign(item,next);});input.type='number';input.min='1';input.max='24';}field(props,'방향',item.flip?'flip':'normal',value=>item.flip=value==='flip',[['normal','기본'],['flip','좌우 반전']]);}
    }

  }
  async function load(nextOwner){
    owner=nextOwner;const data=await request('room');approved=data.catalog;payload=data.payload;revision=data.revision;stale=data.stale;saved=JSON.stringify(payload);history.reset(payload);preview();api.enter(owner);render();message(api.preview?'미리보기 · 저장되지 않음':'편집을 마치면 자동 저장됩니다.');
  }
  const hit=event=>{
    const id=event.target.closest('[data-object]')?.dataset.object;
    if(id)return floor().exhibits.find(e=>id==='display:'+owner+':'+state().level+':'+e.id)||villageContent(model,'ko','').places.find(p=>p.id===id&&p.area==='room'&&p.owner===owner&&(p.floor||0)===state().level&&!p.editType);
    const p=api.point(event);return [...floor().exhibits].reverse().find(e=>{const g=groundPosition(e,'exhibit');return Math.abs(g.x-p.x)<.8&&p.y>=g.y-3&&p.y<=g.y+.7;});
  };
  function paint(event){
    const raw=api.point(event),point={x:Math.round(raw.x),y:Math.round(raw.y)},space=placement();
    if(['floor','transparent','empty'].includes(tool)){
      const error=paintError(space,point,tool);if(error){message(error);return;}
      if(tool==='empty'&&space.world.decorations.some(p=>Math.round(p.x)===point.x&&Math.round(p.y)===point.y)){message('전시물 아래 바닥을 남겨주세요.');return;}
      if((terrainAt(floor(),point.x,point.y)||'empty')===tool)return;setTerrain(floor(),point.x,point.y,tool);changed();
    }else if(tool==='erase'){const item=hit(event);if(item){if(item.shape){payload.room.hiddenItems=[...new Set([...(payload.room.hiddenItems||[]),item.id])];}else floor().exhibits=floor().exhibits.filter(e=>e.id!==item.id);selected='';changed();}}
    else if(tool==='exhibit'){
      if(!allChoices().some(([id])=>id===reference)){message('등록된 내 작품을 선택해 주세요.');return;}
      const error=objectPlacementError(space,'exhibit','',point);if(error){message(error);return;}
      const [kind,ref]=reference.split(':'),item={id:'display-'+crypto.randomUUID().slice(0,8),kind,ref,...point,width:1,depth:1};floor().exhibits.push(item);selected=item.id;changed();render();
    }
  }
  function brush(event){const before=structuredClone(payload);try{paint(event);}catch(error){payload=before;message(error.message);}}
  let suppressClick=false;
  api.scene.addEventListener('pointerdown',event=>{
    if(!active()||event.isPrimary===false||event.button!==0||event.target.closest('[data-ui],#village-popup'))return;
    const item=hit(event);if(tool==='move'&&(!item||item.shape))return;
    event.preventDefault();event.stopImmediatePropagation();api.scene.setPointerCapture(event.pointerId);api.canvas.focus({preventScroll:true});history.begin();suppressClick=true;
    gesture={pointer:event.pointerId,item:tool==='move'&&selected===item.id?item:null,selecting:tool==='move',startX:event.clientX,startY:event.clientY,point:api.point(event),x:item?.x,y:item?.y};
    if(tool==='move'){selected=item.id;sheet='selection';render();}else try{brush(event);}catch(error){message(error.message);}
  },true);
  api.scene.addEventListener('pointermove',event=>{
    if(!active())return;cursor=api.point(event);api.requestDraw();
    if(!gesture||gesture.pointer!==event.pointerId)return;event.stopImmediatePropagation();
    try{if(gesture.item){if(Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)<6)return;const point={x:Math.round(gesture.x+cursor.x-gesture.point.x),y:Math.round(gesture.y+cursor.y-gesture.point.y)},error=objectPlacementError(placement(),'exhibit',gesture.item.id,point);if(error){message(error);return;}Object.assign(gesture.item,point);changed();}else if(!gesture.selecting&&['floor','transparent','empty','erase'].includes(tool))brush(event);}catch(error){message(error.message);}
  },true);
  const end=()=>{if(gesture){gesture=null;history.end(payload);api.requestDraw();}};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])api.scene.addEventListener(type,event=>{if(gesture){event.stopImmediatePropagation();end();}},true);
  listen(window,'blur',end);api.scene.addEventListener('pointerleave',()=>{cursor=null;api.requestDraw();});
  api.scene.addEventListener('click',event=>{if(suppressClick){suppressClick=false;if(!event.target.closest('[data-ui]'))event.stopImmediatePropagation();}},true);
  listen(window,'keydown',event=>{if(panel.hidden||confirmation.open)return;if(event.key==='Escape'){event.preventDefault();void closeStudio();return;}if(!payload)return;const action=historyShortcut(event);if(action){event.preventDefault();travel(action);}});
  try{
    identity=api.identity||await request('session');const workers=JSON.parse(api.root.dataset.workers),owners=workers.filter(w=>identity.host||identity.owners.includes(w.id));
    if(identity.host)button(top,'변경 요청 검토',()=>void task(async()=>{
      await persist();const proposals=await request('proposals');body.replaceChildren();editing=false;panel.dataset.room='false';api.scene.classList.toggle('is-decorating',false);api.editorUI?.('',false);api.updateFloors?.();
      for(const proposal of proposals){const row=node('div');row.append(node('p',proposal.worker_id+' · '+proposal.reason));
        const link=node('a','변경안 JSON 받기');link.href='/api/studio/proposal?id='+encodeURIComponent(proposal.id);link.download=proposal.id+'.json';row.append(link);
        for(const [action,label]of [['reject','반려'],['published','발행 결과 확인']])button(row,label,()=>void task(async()=>{const response=await fetch('/api/studio/'+action+'?id='+encodeURIComponent(proposal.id),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),result=await response.json();if(!response.ok)throw Error(result.error);row.remove();message(label+' 완료');}));body.append(row);
      }
      body.append(node('p','변경안 JSON을 로컬 호스트 편집기의 ‘변경안 가져오기’로 열어 검토·저장·콘텐츠 배포한 뒤 발행 결과를 확인하세요.'));api.requestDraw();
    })).className='participant-review';
    if(!owners.length){message('로그인했습니다. 호스트가 Discord 계정과 업체를 연결하면 꾸밀 수 있습니다.');body.append(node('small','Discord ID: '+identity.id));}
    else{const picker=node('select');picker.setAttribute('aria-label','내 작업실 선택');for(const w of owners)picker.append(new Option(w.name,w.id));top.append(picker);picker.addEventListener('change',()=>void task(async()=>{const next=picker.value;picker.value=owner;await persist();await load(next);picker.value=next;}));await load(owners[0].id);}
    button(top,'로그아웃',()=>void task(async()=>{await persist();await request('logout',{});location.reload();}));
  }catch(error){message(error.message);if(error.status===401){panel.hidden=true;api.loginRequired?.();}}
  return {renderFloors,undo:()=>travel('undo'),get isEditing(){return editing&&!panel.hidden&&inRoom();},get isOpen(){return !panel.hidden;},close:closeStudio,async home(){if(owner&&payload){if(await closeStudio())api.enter(owner);}else{panel.hidden=false;render();}},open(){panel.hidden=false;render();},areaChanged(){end();if(!inRoom())editing=false;cursor=null;render();api.requestDraw();},draw(level){
    if(!active()||level!==state().level)return;const c=api.ctx,scale=state().scale;c.save();c.translate(0,-roomElevation(state().worker,state().level));c.lineWidth=1/scale;
    const outline=(x,y,color)=>{const p=toScreen(x,y);c.beginPath();c.moveTo(p.x,p.y-12);c.lineTo(p.x+24,p.y);c.lineTo(p.x,p.y+12);c.lineTo(p.x-24,p.y);c.closePath();c.strokeStyle=color;c.stroke();};
    const bounds=terrainBounds(floor(),3);c.globalAlpha=.15;for(let x=bounds.minX;x<=bounds.maxX;x++)for(let y=bounds.minY;y<=bounds.maxY;y++)outline(x,y,'#203745');c.globalAlpha=1;
    if(cursor){const point={x:Math.round(cursor.x),y:Math.round(cursor.y)},space=placement();if(['floor','transparent','empty'].includes(tool))outline(point.x,point.y,paintError(space,point,tool)?'#ed625d':'#edcba9');else{const candidate=tool==='exhibit'?{type:'exhibit',id:'',point}:placementObjects(space).find(o=>o.id===selected);if(candidate)for(const cell of placementCells(space,candidate.type,candidate.id,candidate.point))outline(cell.x,cell.y,cell.error?'#ed625d':'#edcba9');}}
    c.restore();
  }};
}
