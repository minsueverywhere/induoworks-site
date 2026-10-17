import './village-participant.css';
import {createHistory,historyShortcut} from '../../scripts/editor/history.mjs';
import {mergeStudio} from '../server/studio-content.mjs';
import {CONTENT_ORIGIN,resolveMedia} from '../content-schema.mjs';
import {roomCatalog,objectPlacementError,paintError,placementObjects,placementCells} from '../../scripts/editor-placement.mjs';
import {setTerrain,terrainAt,groundPosition,terrainBounds} from './village-world.mjs';
import {toScreen} from './village-camera.mjs';
import {roomElevation} from './village-room.mjs';

export async function createParticipantEditor(api){
  const panel=document.createElement('section');panel.className='participant-studio';panel.dataset.ui='';panel.setAttribute('aria-label','내 작업실');api.scene.append(panel);
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const status=node('p');status.setAttribute('role','status');
  const top=node('details');top.className='participant-top';top.append(node('summary','계정'));const close=node('button','×');close.type='button';close.className='participant-dismiss';close.setAttribute('aria-label','설정 닫기');panel.append(close,top,status);
  const body=node('div');body.className='participant-body';panel.append(body);
  let identity,owner='',approved,payload,baseHash,revision=0,stale=false,editing=false,tool='move',selected='',cursor=null,gesture=null,saved='',busy=false,tab='room',sheet='';
  const history=createHistory();let model,placementCache=null;
  const placement=()=>{if(!placementCache||placementCache.level!==state().level)placementCache={level:state().level,space:roomCatalog(model,owner,state().level)};return placementCache.space;};
  const state=()=>api.state(),floor=()=>payload.room.floors[state().level];
  const inRoom=()=>state().area==='room'&&state().worker?.id===owner;
  const active=()=>editing&&inRoom()&&!busy&&!panel.hidden;
  const message=text=>{status.textContent=text;};
  async function request(action,data){
    const response=await fetch('/api/studio/'+action+(owner?'?owner='+encodeURIComponent(owner):''),data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{cache:'no-store'});
    const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'요청을 처리하지 못했습니다.'),{status:response.status});return result;
  }
  const preview=()=>{model=mergeStudio(approved,owner,payload);placementCache=null;api.apply(resolveMedia(model,CONTENT_ORIGIN));};
  function changed(){preview();history.record(payload);message('내 미리보기 · 공개 사이트는 아직 바뀌지 않았습니다.');}
  function travel(action){const next=history[action](payload);if(next){payload=next;preview();render();api.requestDraw();}}
  const dirty=()=>payload&&JSON.stringify(payload)!==saved;
  window.addEventListener('beforeunload',event=>{if(dirty())event.preventDefault();});
  const closeStudio=()=>{end();panel.hidden=true;editing=false;api.canvas.focus({preventScroll:true});api.requestDraw();};
  close.addEventListener('click',closeStudio);
  async function task(action){if(busy)return;busy=true;panel.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);try{await action();}catch(error){message(error.message);}finally{busy=false;panel.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=false);}}
  function button(parent,label,action){const el=node('button',label);el.type='button';el.addEventListener('click',action);parent.append(el);return el;}
  function field(parent,label,value,update,options){
    const wrap=node('label'),caption=node('span',label),input=node(options?'select':'input');
    if(options){for(const [id,text] of options)input.append(new Option(text,id));input.value=String(value??'');}else input.value=String(value??'');
    input.addEventListener('focus',()=>history.begin());input.addEventListener('blur',()=>history.end(payload));
    input.addEventListener(options?'change':'input',()=>{const before=structuredClone(payload);try{update(input.value);changed();}catch(error){if(options){payload=before;render();}else history.record(payload);message(error.message);}});
    wrap.append(caption,input);parent.append(wrap);return input;
  }
  const allChoices=()=>[...payload.projects.map(p=>['project:'+p.slug,p.title.ko||p.slug]),...payload.media.map(m=>['media:'+m.id,m.title.ko||m.id]),['music:legacy',approved.music.title],...payload.tracks.map(t=>['music:'+t.id,t.title])];
  let reference='music:legacy';
  function render(){
    if(!payload)return;body.replaceChildren();panel.dataset.room=String(tab==='room'&&inRoom());panel.dataset.editing=String(editing);
    const detail=(label,open=false)=>{const box=node('details');box.className='participant-sheet';box.open=open;box.append(node('summary',label));body.append(box);return box;};
    const nav=node('nav');nav.setAttribute('aria-label','작업실 관리');body.append(nav);
    for(const [id,label] of [['room','집 꾸미기'],['projects','Works'],['media','이미지'],['tracks','음악']]){const b=button(nav,label,()=>{tab=id;editing=id==='room';sheet='';render();api.requestDraw();});b.setAttribute('aria-pressed',String(tab===id));}
    if(stale){body.append(node('p','공개 승인본이 바뀌어 저장·제출할 수 없습니다. 변경안을 내려받아 호스트에게 전달해 주세요.'));}
    if(tab==='room'){
      if(!inRoom()){button(body,'내 집으로 들어가기',()=>{api.enter(owner);editing=true;render();});}
      else{
        button(body,editing?'꾸미기 마침':'꾸미기',()=>{editing=!editing;sheet='';render();api.requestDraw();});
        if(editing){
          const tools=node('div');tools.className='participant-tools';tools.setAttribute('role','toolbar');tools.setAttribute('aria-label','실내 꾸미기 도구');body.append(tools);
          for(const [id,label,icon] of [['move','전시물 이동','↖'],['floor','바닥 확장','▦'],['empty','바닥 지우기','▱'],['exhibit','전시물 놓기','▣'],['erase','전시물 지우기','⌫']]){const b=button(tools,icon,()=>{tool=id;sheet=id==='exhibit'?'works':'';render();api.requestDraw();});b.title=label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(tool===id));}
          button(tools,'↶',()=>travel('undo')).setAttribute('aria-label','실행 취소');button(tools,'↷',()=>travel('redo')).setAttribute('aria-label','다시 실행');
          const choices=detail('전시할 작품',sheet==='works');choices.className+=' participant-choices';
          field(choices,'전시할 작품·음악',reference,value=>{reference=value;tool='exhibit';sheet='';render();},allChoices());
          const settings=detail('공간·선택한 물체 설정');settings.className+=' participant-settings';
          const wall=field(settings,'벽 높이',floor().wallHeight,value=>{const n=Number(value);if(!Number.isInteger(n)||n<24||n>240)throw Error('벽 높이는 24–240입니다.');floor().wallHeight=n;});wall.type='number';wall.min='24';wall.max='240';
          if(payload.room.floors.length<3)button(settings,'층 추가',()=>{payload.room.floors.push({wallHeight:90,tiles:[{x:0,y:0,type:'floor'}],exhibits:[]});changed();api.enter(owner,payload.room.floors.length-1);render();});
          if(state().level>0)button(settings,'현재 층 삭제',()=>{payload.room.floors.splice(state().level,1);changed();api.enter(owner,Math.min(state().level,payload.room.floors.length-1));render();});
          const item=floor().exhibits.find(e=>e.id===selected);
          if(item){for(const [key,label]of [['width','점유 너비'],['depth','점유 깊이']]){const input=field(settings,label,item[key],value=>{const next={...item,[key]:Number(value)},error=objectPlacementError(placement(),'exhibit',item.id,next);if(error)throw Error(error);Object.assign(item,next);});input.type='number';input.min='1';input.max='24';}field(settings,'방향',item.flip?'flip':'normal',value=>item.flip=value==='flip',[['normal','기본'],['flip','좌우 반전']]);}
        }
      }
    }else renderWorks();
    const actions=detail('저장·변경 요청');actions.className+=' participant-actions';
    if(tab!=='room'){button(actions,'↶',()=>travel('undo')).setAttribute('aria-label','실행 취소');button(actions,'↷',()=>travel('redo')).setAttribute('aria-label','다시 실행');}
    button(actions,'작성본 저장',()=>void task(async()=>{if(stale)throw Error('승인본이 바뀌었습니다.');const result=await request('draft',{baseHash,revision,payload});revision=result.revision;saved=JSON.stringify(payload);message('비공개 작성본을 저장했습니다.');}));
    const reason=node('input');reason.placeholder='변경 이유';reason.maxLength=1000;reason.setAttribute('aria-label','변경 이유');actions.append(reason);
    button(actions,'호스트에게 변경 요청',()=>void task(async()=>{if(stale)throw Error('승인본이 바뀌었습니다.');const result=await request('submit',{baseHash,revision,payload,reason:reason.value});message('검토 요청을 보냈습니다 · '+result.id);}));
    button(actions,'변경안 내려받기',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({owner,baseHash,payload},null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download=owner+'-proposal.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  }
  function renderWorks(){
    const items=payload[tab],key=tab==='projects'?'slug':'id';
    let item=items.find(v=>v[key]===selected)||items[0];
    field(body,'항목 선택',item?.[key]||'',value=>{selected=value;render();},items.map(v=>[v[key],v.title?.ko||v.title||v[key]]));
    button(body,'추가',()=>{
      const id=(tab==='projects'?'work-':tab==='media'?'art-':'music-')+crypto.randomUUID().slice(0,8),copy=tab==='projects'?{slug:id,year:String(new Date().getFullYear()),stack:[],tags:[],kind:'game',status:'in-progress',workerIds:[owner],...Object.fromEntries(['title','summary','role','challenge','approach','outcome'].map(k=>[k,{ko:k==='title'?'새 작품':'',en:k==='title'?'New work':''}]))}:structuredClone(tab==='media'?approved.media[0]:approved.tracks?.[0]||approved.music);
      if(!copy){message('호스트에게 먼저 사용할 파일 등록을 요청해 주세요.');return;}
      if(tab!=='projects'){copy.id=id;copy.workerIds=[owner];if(tab==='tracks')copy.artist=identity.name;}
      const before=structuredClone(payload);try{items.push(copy);changed();selected=id;render();}catch(error){payload=before;message(error.message);}
    });
    if(!item)return;
    body.append(node('small',item[key]));
    if(tab!=='tracks')for(const locale of ['ko','en'])field(body,'제목 · '+locale,item.title[locale],value=>item.title[locale]=value);
    if(tab==='projects'){
      field(body,'외부 작품 링크 · YouTube / SoundCloud / GitHub 파일',item.externalUrl||'',value=>{if(value)item.externalUrl=value;else delete item.externalUrl;});
      body.append(node('small','링크만 등록해 집 안에 전시할 수 있습니다. 플레이어는 전시물을 눌렀을 때 열립니다.'));
      for(const locale of ['ko','en'])for(const [key,label] of [['summary','소개'],['role','역할'],['challenge','배경'],['approach','작업 과정'],['outcome','현재 상태']])field(body,label+' · '+locale,item[key][locale],value=>item[key][locale]=value);
      field(body,'분야',item.kind,value=>item.kind=value,[['game','게임'],['music','음악'],['artwork','아트워크'],['site','웹사이트'],['experiment','실험']]);field(body,'상태',item.status,value=>item.status=value,[['in-progress','진행 중'],['shipped','완료'],['paused','보류']]);
      field(body,'연도',item.year,value=>item.year=value);field(body,'태그',item.tags?.join(', ')||'',value=>item.tags=value.split(',').map(s=>s.trim()).filter(Boolean));
      field(body,'대표 이미지',item.thumbnail?.src||'',value=>{if(!value){delete item.thumbnail;return;}const image=approved.projects.find(p=>p.thumbnail?.src===value)?.thumbnail||approved.media.find(m=>m.preview===value);item.thumbnail=image?.src?structuredClone(image):{src:image.preview,width:image.width,height:image.height,alt:structuredClone(item.title),caption:{ko:'아트워크',en:'Artwork'}};},[['','이미지 없음'],...approved.projects.filter(p=>p.thumbnail).map(p=>[p.thumbnail.src,p.title.ko]),...approved.media.map(m=>[m.preview,m.title.ko])]);
    }else if(tab==='media'){
      for(const locale of ['ko','en'])field(body,'소개 · '+locale,item.description?.[locale]||'',value=>{item.description??={ko:'',en:''};item.description[locale]=value;});
      field(body,'호스트가 등록한 이미지',item.original,value=>{const source=approved.media.find(m=>m.original===value);for(const key of ['original','preview','badge','width','height','bytes'])item[key]=source[key];},approved.media.map(m=>[m.original,m.title.ko]));
    }else{
      field(body,'곡명',item.title,value=>item.title=value);field(body,'작곡가·팀',item.artist||'',value=>item.artist=value);field(body,'관련 작품',item.project,value=>item.project=value);
      field(body,'등록된 음원',item.sources.ogg||item.sources.mp3,value=>{const source=[approved.music,...(approved.tracks||[])].find(t=>(t.sources.ogg||t.sources.mp3)===value);for(const key of ['sources','duration','sourceSha256'])item[key]=structuredClone(source[key]);},[approved.music,...(approved.tracks||[])].map(t=>[t.sources.ogg||t.sources.mp3,t.title]));
    }
    body.append(node('p','새 파일은 호스트에게 등록을 요청하세요. 여기서는 등록된 파일을 선택합니다.'));
  }
  async function load(nextOwner){
    owner=nextOwner;const data=await request('draft');approved=data.catalog;payload=data.payload;baseHash=data.baseHash;revision=data.revision;stale=data.stale;saved=JSON.stringify(payload);history.reset(payload);preview();api.enter(owner);render();message('비공개 작성본 · 승인 전에는 나에게만 보입니다.');
  }
  const hit=event=>{
    const id=event.target.closest('[data-object]')?.dataset.object;
    if(id)return floor().exhibits.find(e=>id==='display:'+owner+':'+state().level+':'+e.id);
    const p=api.point(event);return [...floor().exhibits].reverse().find(e=>{const g=groundPosition(e,'exhibit');return Math.abs(g.x-p.x)<.8&&p.y>=g.y-3&&p.y<=g.y+.7;});
  };
  function paint(event){
    const raw=api.point(event),point={x:Math.round(raw.x),y:Math.round(raw.y)},space=placement();
    if(tool==='floor'||tool==='empty'){
      const error=paintError(space,point,tool);if(error){message(error);return;}
      if(tool==='empty'&&space.world.decorations.some(p=>Math.round(p.x)===point.x&&Math.round(p.y)===point.y)){message('전시물 아래 바닥을 남겨주세요.');return;}
      if((terrainAt(floor(),point.x,point.y)||'empty')===tool)return;setTerrain(floor(),point.x,point.y,tool);changed();
    }else if(tool==='erase'){const item=hit(event);if(item){floor().exhibits=floor().exhibits.filter(e=>e.id!==item.id);changed();}}
    else if(tool==='exhibit'){
      const error=objectPlacementError(space,'exhibit','',point);if(error){message(error);return;}
      const [kind,ref]=reference.split(':'),item={id:'display-'+crypto.randomUUID().slice(0,8),kind,ref,...point,width:1,depth:1};floor().exhibits.push(item);selected=item.id;changed();render();
    }
  }
  function brush(event){const before=structuredClone(payload);try{paint(event);}catch(error){payload=before;message(error.message);}}
  let suppressClick=false;
  api.scene.addEventListener('pointerdown',event=>{
    if(!active()||event.isPrimary===false||event.button!==0||event.target.closest('[data-ui],#village-popup'))return;
    const item=hit(event);if(tool==='move'&&!item)return;
    event.preventDefault();event.stopImmediatePropagation();api.scene.setPointerCapture(event.pointerId);api.canvas.focus({preventScroll:true});history.begin();suppressClick=true;
    gesture={pointer:event.pointerId,item:tool==='move'&&selected===item.id?item:null,selecting:tool==='move',startX:event.clientX,startY:event.clientY,point:api.point(event),x:item?.x,y:item?.y};
    if(tool==='move'){selected=item.id;render();}else try{brush(event);}catch(error){message(error.message);}
  },true);
  api.scene.addEventListener('pointermove',event=>{
    if(!active())return;cursor=api.point(event);api.requestDraw();
    if(!gesture||gesture.pointer!==event.pointerId)return;event.stopImmediatePropagation();
    try{if(gesture.item){if(Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)<6)return;const point={x:Math.round(gesture.x+cursor.x-gesture.point.x),y:Math.round(gesture.y+cursor.y-gesture.point.y)},error=objectPlacementError(placement(),'exhibit',gesture.item.id,point);if(error){message(error);return;}Object.assign(gesture.item,point);changed();}else if(!gesture.selecting&&['floor','empty','erase'].includes(tool))brush(event);}catch(error){message(error.message);}
  },true);
  const end=()=>{if(gesture){gesture=null;history.end(payload);api.requestDraw();}};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])api.scene.addEventListener(type,event=>{if(gesture){event.stopImmediatePropagation();end();}},true);
  window.addEventListener('blur',end);api.scene.addEventListener('pointerleave',()=>{cursor=null;api.requestDraw();});
  api.scene.addEventListener('click',event=>{if(suppressClick){suppressClick=false;if(!event.target.closest('[data-ui]'))event.stopImmediatePropagation();}},true);
  window.addEventListener('keydown',event=>{if(panel.hidden)return;if(event.key==='Escape'){event.preventDefault();closeStudio();return;}if(!payload)return;const action=historyShortcut(event);if(action){event.preventDefault();travel(action);}});
  try{
    identity=await request('session');const workers=JSON.parse(api.root.dataset.workers),owners=workers.filter(w=>identity.host||identity.owners.includes(w.id));
    if(identity.host)button(top,'변경 요청 검토',()=>void task(async()=>{
      const proposals=await request('proposals');body.replaceChildren();editing=false;panel.dataset.room='false';
      for(const proposal of proposals){const row=node('div');row.append(node('p',proposal.worker_id+' · '+proposal.reason));
        const link=node('a','변경안 JSON 받기');link.href='/api/studio/proposal?id='+encodeURIComponent(proposal.id);link.download=proposal.id+'.json';row.append(link);
        for(const [action,label]of [['reject','반려'],['published','발행 결과 확인']])button(row,label,()=>void task(async()=>{const response=await fetch('/api/studio/'+action+'?id='+encodeURIComponent(proposal.id),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),result=await response.json();if(!response.ok)throw Error(result.error);row.remove();message(label+' 완료');}));body.append(row);
      }
      body.append(node('p','변경안 JSON을 로컬 호스트 편집기의 ‘변경안 가져오기’로 열어 검토·저장·콘텐츠 배포한 뒤 발행 결과를 확인하세요.'));api.requestDraw();
    })).className='participant-review';
    if(!owners.length){message('로그인했습니다. 호스트가 Discord 계정과 업체를 연결하면 꾸밀 수 있습니다.');body.append(node('small','Discord ID: '+identity.id));}
    else{const picker=node('select');picker.setAttribute('aria-label','내 작업실 선택');for(const w of owners)picker.append(new Option(w.name,w.id));top.append(picker);picker.addEventListener('change',()=>void task(async()=>{if(dirty()){picker.value=owner;throw Error('현재 작성본을 저장하거나 내려받은 뒤 작업실을 바꿔주세요.');}await load(picker.value);}));await load(owners[0].id);}
    button(top,'로그아웃',()=>void task(async()=>{if(dirty())throw Error('작성본을 먼저 저장하거나 내려받아 주세요.');await request('logout',{});location.reload();}));
  }catch(error){message(error.message);if(error.status===401){if(new URLSearchParams(location.search).has('authError'))message('로그인 확인이 만료되었거나 완료되지 않았습니다. 다시 로그인해 주세요.');const login=node('a','Discord로 로그인');login.href='/api/studio/login';body.append(login);}}
  return {home(){if(owner&&payload){closeStudio();api.enter(owner);}else{panel.hidden=false;render();}},open(){panel.hidden=false;render();},areaChanged(){end();if(!inRoom())editing=false;cursor=null;render();api.requestDraw();},draw(level){
    if(!active()||level!==state().level)return;const c=api.ctx,scale=state().scale;c.save();c.translate(0,-roomElevation(state().worker,state().level));c.lineWidth=1/scale;
    const outline=(x,y,color)=>{const p=toScreen(x,y);c.beginPath();c.moveTo(p.x,p.y-12);c.lineTo(p.x+24,p.y);c.lineTo(p.x,p.y+12);c.lineTo(p.x-24,p.y);c.closePath();c.strokeStyle=color;c.stroke();};
    const bounds=terrainBounds(floor(),3);c.globalAlpha=.15;for(let x=bounds.minX;x<=bounds.maxX;x++)for(let y=bounds.minY;y<=bounds.maxY;y++)outline(x,y,'#203745');c.globalAlpha=1;
    if(cursor){const point={x:Math.round(cursor.x),y:Math.round(cursor.y)},space=placement();if(['floor','empty'].includes(tool))outline(point.x,point.y,paintError(space,point,tool)?'#ed625d':'#edcba9');else{const candidate=tool==='exhibit'?{type:'exhibit',id:'',point}:placementObjects(space).find(o=>o.id===selected);if(candidate)for(const cell of placementCells(space,candidate.type,candidate.id,candidate.point))outline(cell.x,cell.y,cell.error?'#ed625d':'#edcba9');}}
    c.restore();
  }};
}
