import {soundtrackChoices} from './village-tracks.mjs';
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
  const top=api.accountPanel||node('div');top.className='participant-top';top.hidden=true;if(!api.accountPanel)api.scene.append(top);panel.append(status);
  const listen=(target,type,fn)=>target.addEventListener(type,fn,api.signal?{signal:api.signal}:undefined);
  const body=node('div');body.className='participant-body';panel.append(body);
  const confirmation=node('dialog');confirmation.className='participant-confirm';confirmation.setAttribute('aria-label','층 삭제 확인');panel.append(confirmation);
  let identity,owner='',approved,payload,revision=0,stale=false,editing=false,tool='move',selected='',cursor=null,gesture=null,saved='',busy=false,sheet='';
  const history=createHistory();let ownerIds=[],picker,model,placementCache=null,closing,lastSavedAt=0,villageEditor;
  const wantsVillage=()=>identity?.host&&api.state().area==='village';
  async function openVillage(){
    end();panel.hidden=true;editing=false;hideAccount();
    if(!villageEditor){const {createVillageEditor}=await import('./village-host.js');villageEditor=createVillageEditor({...api,identity});}
    try{await villageEditor.open();}catch(error){panel.hidden=false;throw error;}
  }
  const toolLabels={move:'선택·이동',exhibit:'물건 놓기',floor:'타일 놓기',transparent:'투명 타일',empty:'타일 지우기'};
  const placement=()=>{if(!placementCache||placementCache.level!==state().level)placementCache={level:state().level,space:roomCatalog(model,owner,state().level)};return placementCache.space;};
  const state=()=>api.state(),floor=()=>payload.room.floors[state().level];
  const inRoom=()=>state().area==='room'&&state().worker?.id===owner;
  const active=()=>editing&&inRoom()&&!busy&&!panel.hidden;
  const message=text=>{status.textContent=text;};
  const hideAccount=()=>{top.hidden=true;api.accountButton?.setAttribute('aria-expanded','false');};
  const toggleAccount=()=>{top.hidden=!top.hidden;api.accountButton?.setAttribute('aria-expanded',String(!top.hidden));};
  async function request(action,data){
    if(api.preview){
      if(action==='session')return {host:!!api.previewHost,owners:api.catalog.workers.filter(w=>w.house).map(w=>w.id)};
      if(action==='room'&&!data)return {catalog:structuredClone(api.catalog),payload:studioSlice(api.catalog,owner),baseHash:'preview',revision:0,stale:false};
      throw Error('미리보기에서는 저장·검토 요청을 하지 않습니다.');
    }
    const response=await fetch('/api/studio/'+action+(owner?'?owner='+encodeURIComponent(owner):''),data?{signal:AbortSignal.timeout(15000),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{cache:'no-store'});
    const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'요청을 처리하지 못했습니다.'),{status:response.status});return result;
  }
  const preview=()=>{model=mergeStudio(approved,owner,payload);placementCache=null;api.apply(resolveMedia(model,CONTENT_ORIGIN),owner);};
  function changed(){preview();history.record(payload);message('');}
  function travel(action){if(busy)return;const next=history[action](payload);if(next){payload=next;preview();if(state().level>=payload.room.floors.length)api.enter(owner,payload.room.floors.length-1);render();api.requestDraw();}}
  const dirty=()=>payload&&JSON.stringify(payload)!==saved;
  function resetSelection(){selected='';sheet='';cursor=null;suppressClick=false;tool='move';}
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
    end();confirmation.close();hideAccount();
    closing=task(async()=>{
      await persist();resetSelection();panel.hidden=true;editing=false;api.scene.dataset.placing='false';api.onClose?.();api.scene.classList.toggle('is-decorating',false);api.editorUI?.('',false);api.updateFloors?.();api.canvas.focus({preventScroll:true});api.requestDraw();return true;
    }).then(result=>result===true).finally(()=>{closing=null;});
    return closing;
  }
  listen(document,'astro:before-preparation',event=>{
    if(api.preview||!dirty())return;
    const loader=event.loader;
    event.loader=async()=>{if(await closeStudio())await loader();else event.preventDefault();};
  });
  async function task(action){if(busy)return;busy=true;[...panel.querySelectorAll('button,input,select,textarea'),...top.querySelectorAll('button,input,select,textarea'),...(api.floorBar?.querySelectorAll('button,input')||[])].forEach(el=>el.disabled=true);try{return await action();}catch(error){message(error.message);}finally{busy=false;[...panel.querySelectorAll('button,input,select,textarea'),...top.querySelectorAll('button,input,select,textarea'),...(api.floorBar?.querySelectorAll('button,input')||[])].forEach(el=>el.disabled=false);}}
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
    return [['guestbook:guestbook','노트'],...approved.projects.filter(own).map(p=>['project:'+p.slug,p.title.ko||p.slug]),...approved.media.filter(own).map(m=>['media:'+m.id,m.title.ko||m.id]),...(own(approved.music)?[['music:legacy',approved.music.title]]:[]),...(approved.tracks||[]).filter(own).map(t=>['music:'+t.id,t.title])];
  };
  let reference='',objectKind='project';
  const objectKinds=[['project','전시대','stand'],['media','그림','image'],['music','음악','music'],['guestbook','노트','note']];
  const kindChoices=kind=>allChoices().filter(([id])=>id.startsWith(kind+':'));
  const selectedItem=()=>floor().exhibits.find(e=>e.id===selected)||villageContent(model,'ko','').places.find(p=>p.id===selected&&p.area==='room'&&p.owner===owner&&(p.floor||0)===state().level);
  function editableItem(item){
    if(!item.shape)return item;
    const kind={game:'project',artwork:'media',jukebox:'music'}[item.shape];
    const ref=kind==='music'?(item.music?.id||'legacy'):item.id.slice(owner.length+1);
    const next={id:'display-'+crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8,'0'),kind,ref,x:item.x,y:item.y,width:1,depth:1};
    payload.room.hiddenItems=[...new Set([...(payload.room.hiddenItems||[]),item.id])];floor().exhibits.push(next);selected=next.id;return next;
  }
  const paths={move:'m4 3 7 17 2-7 7-2Z',exhibit:'m12 3 9 5v9l-9 5-9-5V8Zm-9 5 9 5 9-5M12 13v9',floor:'m12 4 9 5-9 5-9-5Zm-4.5 2.5 9 5m-9 0 9-5',empty:'m4 8 8-5 8 5-8 5Zm3 10h10',transparent:'m3 12 9-5 9 5-9 5Zm4-2 10 4',stand:'m5 3 14 7v10L5 13ZM8 15v5m8-1v3M5 21l7 3 7-3',image:'m4 3 16 8v10L4 13Zm4 8 3-1 5 7M8 7h.01',music:'m3 9 9-5 9 5v9l-9 5-9-5Zm0 0 9 5 9-5M12 14v9M8 9a4 2 0 1 0 8 0 4 2 0 1 0-8 0',note:'m3 8 9-5 9 5-9 5Zm2 1v11m14-11v11M12 13v10M8 8l4-2 4 2-4 2Z',flip:'M12 3v18M3 17l6-10v10Zm18 0L15 7v10Z',work:'M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h6',plus:'M12 5v14M5 12h14',undo:'M4 10h9a7 7 0 0 1 7 7M4 10l5-5M4 10l5 5',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7'};
  function icon(parent,label,key,action){
    const b=button(parent,'',action);b.title=label;b.setAttribute('aria-label',label);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',paths[key]);svg.append(path);b.append(svg,node('span',label));return b;
  }
  function renderFloors(){
    if(!api.floorBar||!editing||panel.hidden||!inRoom())return false;
    const bar=api.floorBar;bar.hidden=false;bar.replaceChildren();
    payload.room.floors.forEach((_,level)=>{
      const row=node('div');row.className='floor-row';bar.append(row);
      const b=button(row,(level+1)+'층',()=>{api.enter(owner,level);render();});b.setAttribute('aria-pressed',String(state().level===level));
      if(level!==state().level)return;
      const heights=[[60,'낮음'],[90,'보통'],[140,'높음']],height=floor().wallHeight,index=heights.findIndex(([n])=>n>=height),current=index<0?2:index;
      const cycle=button(row,heights[current][1],()=>{floor().wallHeight=heights[(current+1)%heights.length][0];changed();render();});cycle.className='floor-height';cycle.setAttribute('aria-label','층 높이: '+heights[current][1]);cycle.title='눌러서 층 높이 변경';
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
    if(!payload)return;body.replaceChildren();editing=inRoom();panel.dataset.room=String(editing);api.scene.classList.toggle('is-decorating',editing&&!panel.hidden);api.scene.dataset.placing=String(tool==='exhibit'&&editing&&!panel.hidden);api.editorUI?.(toolLabels[tool],editing&&!panel.hidden);renderFloors();
    if(stale){body.append(node('p','승인본이 바뀌었습니다. 변경안을 내려받아 호스트에게 전달해 주세요.'));}
    if(!inRoom())button(body,'작업실로 이동',()=>{api.enter(owner);render();});
    else{
      const tools=node('div');tools.className='participant-tools';tools.setAttribute('role','toolbar');tools.setAttribute('aria-label','작업실 편집 도구');body.append(tools);
      for(const [id,label] of [['move','선택·이동'],['exhibit','물건 놓기'],['floor','타일 놓기']]){
        const b=icon(tools,label,id,()=>{
          selected='';cursor=null;
          if(id==='exhibit'){tool='exhibit';sheet=sheet==='objects'?'':'objects';if(!kindChoices(objectKind).length)objectKind=objectKinds.find(([kind])=>kindChoices(kind).length)?.[0]||objectKind;}
          else if(id==='floor'){if(!['floor','transparent','empty'].includes(tool))tool='floor';sheet=sheet==='tiles'?'':'tiles';}
          else{tool=id;sheet='';}render();api.requestDraw();
        });b.setAttribute('aria-pressed',String(id==='floor'?['floor','transparent','empty'].includes(tool):tool===id));
      }
      icon(tools,'실행 취소','undo',()=>{travel('undo');api.requestDraw();});
      const row=key=>{const el=node('div');el.className='participant-subtools participant-'+key;el.setAttribute('role','toolbar');el.setAttribute('aria-label',key==='objects'?'물건 종류':key==='tiles'?'타일 종류':'선택한 물건 도구');body.append(el);return el;};
      if(sheet==='objects'){
        const palette=row('objects');for(const [kind,label,key]of objectKinds.filter(([kind])=>kindChoices(kind).length)){const b=icon(palette,label,key,()=>{objectKind=kind;reference=kindChoices(kind)[0]?.[0]||'';render();api.requestDraw();});b.setAttribute('aria-pressed',String(objectKind===kind));}
      }
      if(sheet==='tiles'){
        const palette=row('tiles');for(const [id,label]of [['floor','실내 타일'],['transparent','투명 타일'],['empty','타일 제거']]){const b=icon(palette,label,id,()=>{tool=id;render();api.requestDraw();});b.setAttribute('aria-pressed',String(tool===id));}
      }
      const item=selectedItem();
      if(item&&tool==='move'){
        const controls=row('selection'),kind=item.kind||{game:'project',artwork:'media',jukebox:'music'}[item.shape];
        if(kind==='guestbook'){const input=field(controls,'노트 제목',item.title||'',value=>item.title=value.trim());input.maxLength=60;input.placeholder='방명록';}
        else{
          const options=kindChoices(kind),ref=item.ref||(kind==='music'?(item.music?.id||'legacy'):item.id.slice(owner.length+1)),title=options.find(([id])=>id===kind+':'+ref)?.[1]||(kind==='music'?'곡 선택':'작품 선택');
          const choose=icon(controls,kind==='music'?'곡 선택':'작품 선택',kind==='music'?'music':'work',()=>{sheet=sheet==='works'?'':'works';render();});choose.className='participant-reference';choose.children[1].textContent=title;choose.setAttribute('aria-expanded',String(sheet==='works'));
          if(sheet==='works'){
            const list=node('div');list.className='participant-work-picker';list.setAttribute('aria-label','연결할 Work');body.append(list);
            const groups=kind==='music'?soundtrackChoices(approved,kindChoices(kind)):[{choices:kindChoices(kind)}];
            for(const group of groups){let target=list;if(group.title){target=node('details');target.append(node('summary',group.title+' Soundtrack'));list.append(target);}const items=group.choices;
            for(const [id,title]of items){const b=button(target,title,()=>{const next=editableItem(item);next.ref=id.split(':')[1];changed();sheet='';render();});b.setAttribute('aria-pressed',String(id===kind+':'+(item.ref||(kind==='music'?(item.music?.id||'legacy'):item.id.slice(owner.length+1)))));}
            }
          }
        }
        const flip=icon(controls,'좌우 반전','flip',()=>{const next=editableItem(item);next.flip=!next.flip;changed();render();api.requestDraw();});flip.setAttribute('aria-pressed',String(!!item.flip));
        icon(controls,'삭제','trash',()=>{if(item.shape)payload.room.hiddenItems=[...new Set([...(payload.room.hiddenItems||[]),item.id])];else floor().exhibits=floor().exhibits.filter(e=>e.id!==item.id);selected='';sheet='';changed();render();api.requestDraw();});
      }

    }

  }
  async function load(nextOwner){
    owner=nextOwner;const data=await request('room');resetSelection();approved=data.catalog;payload=data.payload;revision=data.revision;stale=data.stale;saved=JSON.stringify(payload);history.reset(payload);preview();api.enter(owner);render();message(api.preview?'미리보기 · 저장되지 않음':'');
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
    }    else if(tool==='exhibit'){
      if(!kindChoices(objectKind).some(([id])=>id===reference))reference=kindChoices(objectKind)[0]?.[0]||'';
      if(!reference){message('이 종류에 연결할 등록 작품이 없습니다.');return;}
      const error=objectPlacementError(space,'exhibit','',point);if(error){message(error);return;}
      const [kind,ref]=reference.split(':'),item={id:'display-'+crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8,'0'),kind,ref,...point,width:1,depth:1};if(kind==='guestbook')item.boardId=item.id;floor().exhibits.push(item);selected=item.id;tool='move';sheet=kind==='guestbook'?'':'works';changed();render();
    }
  }
  function brush(event){const before=structuredClone(payload);try{paint(event);}catch(error){payload=before;message(error.message);}}
  let suppressClick=false;
  api.scene.addEventListener('pointerdown',event=>{
    if(!active()||event.isPrimary===false||event.button!==0||event.target.closest('[data-ui],#village-popup'))return;
    const item=hit(event);if(tool==='move'&&!item)return;
    event.preventDefault();event.stopImmediatePropagation();api.scene.setPointerCapture(event.pointerId);api.canvas.focus({preventScroll:true});history.begin();suppressClick=true;
    gesture={pointer:event.pointerId,item:tool==='move'?item:null,selecting:tool==='move',placing:tool==='exhibit',startX:event.clientX,startY:event.clientY,point:api.point(event),x:item?.x,y:item?.y};
    if(tool==='move'){selected=item.id;sheet='';render();}else if(tool==='exhibit'){cursor=api.point(event);api.requestDraw();}else try{brush(event);}catch(error){message(error.message);}
  },true);
  api.scene.addEventListener('pointermove',event=>{
    if(!active())return;cursor=api.point(event);api.requestDraw();
    if(!gesture||gesture.pointer!==event.pointerId)return;event.stopImmediatePropagation();
    try{if(gesture.item){if(Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)<6)return;const point={x:Math.round(gesture.x+cursor.x-gesture.point.x),y:Math.round(gesture.y+cursor.y-gesture.point.y)},error=objectPlacementError(placement(),'exhibit',gesture.item.id,point);if(error){message(error);return;}gesture.item=editableItem(gesture.item);Object.assign(gesture.item,point);changed();}else if(!gesture.selecting&&['floor','transparent','empty'].includes(tool))brush(event);}catch(error){message(error.message);}
  },true);
  const end=()=>{if(gesture){gesture=null;history.end(payload);api.requestDraw();}};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])api.scene.addEventListener(type,event=>{if(gesture){event.stopImmediatePropagation();if(type==='pointerup'&&gesture.placing)brush(event);end();}},true);
  listen(window,'blur',end);api.scene.addEventListener('pointerleave',()=>{cursor=null;api.requestDraw();});
  api.scene.addEventListener('click',event=>{if(suppressClick){suppressClick=false;if(!event.target.closest('[data-ui]'))event.stopImmediatePropagation();}},true);
  listen(document,'click',event=>{if(!top.hidden&&!top.contains(event.target)&&!api.accountButton?.contains(event.target))hideAccount();});
  listen(window,'keydown',event=>{if(event.key==='Escape'&&!top.hidden){event.preventDefault();hideAccount();return;}if(panel.hidden||confirmation.open)return;if(event.key==='Escape'){event.preventDefault();void closeStudio();return;}if(!payload)return;const action=historyShortcut(event);if(action){event.preventDefault();travel(action);}});
  try{
    identity=api.identity||await request('session');const workers=JSON.parse(api.root.dataset.workers),owners=workers.filter(w=>identity.host||identity.owners.includes(w.id));
    if(identity.host)button(top,'변경 요청 검토',()=>void task(async()=>{
      await persist();const proposals=await request('proposals');hideAccount();panel.hidden=false;api.onOpen?.();body.replaceChildren();editing=false;panel.dataset.room='false';api.scene.classList.toggle('is-decorating',false);api.editorUI?.('',false);api.updateFloors?.();
      for(const proposal of proposals){const row=node('div');row.append(node('p',proposal.worker_id+' · '+proposal.reason));
        const link=node('a','변경안 JSON 받기');link.href='/api/studio/proposal?id='+encodeURIComponent(proposal.id);link.download=proposal.id+'.json';row.append(link);
        for(const [action,label]of [['reject','반려'],['published','발행 결과 확인']])button(row,label,()=>void task(async()=>{const response=await fetch('/api/studio/'+action+'?id='+encodeURIComponent(proposal.id),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),result=await response.json();if(!response.ok)throw Error(result.error);row.remove();message(label+' 완료');}));body.append(row);
      }
      body.append(node('p','변경안 JSON을 로컬 호스트 편집기의 ‘변경안 가져오기’로 열어 검토·저장·콘텐츠 배포한 뒤 발행 결과를 확인하세요.'));api.requestDraw();
    })).className='participant-review';
    if(!owners.length){const note=node('small','호스트가 이 Discord 계정을 업체와 연결하면 꾸밀 수 있습니다. Discord ID: '+identity.id);note.className='participant-note';top.append(note);panel.hidden=true;}
    else{ownerIds=owners.map(w=>w.id);picker=node('select');picker.setAttribute('aria-label','내 작업실 선택');for(const w of owners)picker.append(new Option(w.name,w.id));top.append(picker);picker.addEventListener('change',()=>void task(async()=>{const next=picker.value;picker.value=owner;await persist();if(panel.hidden){owner=next;payload=undefined;}else await load(next);picker.value=next;}));owner=owners[0].id;if(api.accountOnly)panel.hidden=true;else if(wantsVillage())await openVillage();else await load(owner);}
    button(top,'로그아웃',()=>void task(async()=>{if(villageEditor?.isOpen&&!await villageEditor.close())return;await persist();await request('logout',{});location.reload();}));
  }catch(error){message(error.message);if(error.status===401){panel.hidden=true;api.loginRequired?.();}}
  return {toggleAccount,renderFloors,undo:()=>villageEditor?.isOpen?villageEditor.undo():travel('undo'),get isEditing(){return villageEditor?.isEditing||editing&&!panel.hidden&&inRoom();},get isOpen(){return villageEditor?.isOpen||!panel.hidden;},get identity(){return identity;},close:()=>villageEditor?.isOpen?villageEditor.close():closeStudio(),async home(){if(villageEditor?.isOpen&&!await villageEditor.close())return;if(owner&&!payload)await load(owner);if(owner&&payload){if(await closeStudio())api.enter(owner);}else{panel.hidden=false;render();}},async open(target){if(wantsVillage()){await openVillage();return;}if(target&&target!==owner&&ownerIds.includes(target)){owner=target;payload=undefined;picker.value=target;}hideAccount();resetSelection();panel.hidden=false;if(owner&&(!payload||!api.preview&&!dirty()))await load(owner);else render();},areaChanged(){end();if(!inRoom())editing=false;cursor=null;render();api.requestDraw();},draw(level){
    if(villageEditor?.isEditing){villageEditor.draw();return;}
    if(!active()||level!==state().level)return;const c=api.ctx,scale=state().scale;c.save();c.translate(0,-roomElevation(state().worker,state().level));c.lineWidth=1/scale;
    const outline=(x,y,color)=>{const p=toScreen(x,y);c.beginPath();c.moveTo(p.x,p.y-12);c.lineTo(p.x+24,p.y);c.lineTo(p.x,p.y+12);c.lineTo(p.x-24,p.y);c.closePath();c.strokeStyle=color;c.stroke();};
    const bounds=terrainBounds(floor(),3);c.globalAlpha=.15;for(let x=bounds.minX;x<=bounds.maxX;x++)for(let y=bounds.minY;y<=bounds.maxY;y++)outline(x,y,'#203745');c.globalAlpha=1;
    if(cursor||selected){const point=cursor?{x:Math.round(cursor.x),y:Math.round(cursor.y)}:selectedItem()||{x:0,y:0},space=placement();if(['floor','transparent','empty'].includes(tool))outline(point.x,point.y,paintError(space,point,tool)?'#ed625d':'#edcba9');else{const candidate=tool==='exhibit'?{type:'exhibit',id:'',point}:placementObjects(space).find(o=>o.id===selected);if(candidate)for(const cell of placementCells(space,candidate.type,candidate.id,candidate.point))outline(cell.x,cell.y,cell.error?'#ed625d':'#edcba9');}}
    if(tool==='exhibit'&&cursor){const point={x:Math.round(cursor.x),y:Math.round(cursor.y)};api.previewPlacement?.(objectKind,point,reference.split(':')[1],!objectPlacementError(placement(),'exhibit','',point));}
    c.restore();
  }};
}
