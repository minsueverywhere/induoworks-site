import { createHistory, historyShortcut } from '/__editor/history.mjs';
import {roomFloors} from '/src/scripts/village-room.mjs';
import { villageWorld, setTerrain } from '/src/scripts/village-world.mjs';
import { placementError, objectPlacementError, roomCatalog } from '/__editor/placement.mjs';
import {studioSlice,mergeStudio} from '/src/server/studio-content.mjs';
const $=id=>document.getElementById(id),token=document.querySelector('meta[name=editor-token]').content;
let draft,revision,tab='workers',selected='',dirty=false,busy=false,frameReady=false;
const history=createHistory();let saved='',tool='move',roomOwner=null,roomIndex=0;
const sceneWorld=()=>roomOwner?roomFloors(draft.workers.find(w=>w.id===roomOwner))[roomIndex]:draft.world;
function ensureRoom(){const w=draft.workers.find(w=>w.id===roomOwner);w.room??={floors:clone(roomFloors(w))};return w.room;}
function sceneTarget(owner,level){if(!owner)return draft.world;const w=draft.workers.find(w=>w.id===owner);w.room??={floors:clone(roomFloors(w))};return w.room.floors[level];}
function roomControls(){
  document.body.dataset.area=roomOwner?'room':'village';
  if(!frameReady)return;
  const worker=draft.workers.find(w=>w.id===roomOwner);
  $('map').contentWindow.postMessage({source:'induo-editor',type:'roomControls',owner:roomOwner,level:roomIndex,name:worker?.name,wallHeight:worker?sceneWorld().wallHeight:90,count:worker?roomFloors(worker).length:0,choices:exhibitChoices(),selected:worker?sceneWorld().exhibits?.find(e=>e.id===selected):null,busy},location.origin);
}
const clone=value=>JSON.parse(JSON.stringify(value));
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
function status(message,error=false){$('status').textContent=message;$('status').dataset.error=String(error);}
function controls(){document.body.dataset.busy=String(busy);document.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=busy);$('deploy').disabled=busy||dirty;$('undo').disabled=busy||!draft||!history.canUndo(draft);$('redo').disabled=busy||!history.canRedo;if(draft)roomControls();}
function changed(){history.record(draft);dirty=JSON.stringify(draft)!==saved;const item=entry(),option=$('entry').selectedOptions[0];if(item&&option)option.textContent=item.name||item.title?.ko||item.title?.en||item.title||item.id||item.slug;status('저장되지 않은 변경 · 미리보기 갱신으로 적용 상태를 확인하세요.');controls();}
async function api(path,payload){const response=await fetch('/__editor/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Editor-Token':token},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;}
async function task(action){if(busy)return;busy=true;controls();try{await action();}catch(error){status(error.message,true);}finally{busy=false;controls();}}
async function refresh(){await api('preview',{catalog:draft});frameReady=false;$('map').src='/ko/?content=embedded&editor='+Date.now();}
function field(label,value,update,{type='text',options,multiple=false,required=false}={}){
  const wrap=node('label'),caption=node('span',label);wrap.className='field';
  const input=node(options?'select':type==='textarea'?'textarea':'input');
  if(options){input.multiple=multiple;for(const [id,title]of options){const option=new Option(title,id);option.selected=multiple?value.includes(id):String(value??'')===id;input.append(option);}}
  else{if(type!=='textarea')input.type=type;input.value=value??'';if(type==='number')input.step='1';}
  input.required=required;input.addEventListener(options?'change':'input',()=>{if(update(multiple?[...input.selectedOptions].map(o=>o.value):type==='number'?Number(input.value):input.value)===false)return;changed();});
  wrap.append(caption,input);$('fields').append(wrap);return input;
}
function localFields(label,object,key,required=false){for(const [locale,name]of [['ko','한국어'],['en','영어']])field(label+' · '+name,object[key][locale],value=>object[key][locale]=value,{type:key==='title'?'text':'textarea',required});}
function owners(item){field('업체·개인 (여러 명은 Ctrl/⌘로 선택)',item.workerIds||[],value=>item.workerIds=value,{multiple:true,options:draft.workers.map(w=>[w.id,w.name])});}
function upload(label,accept,apply){const wrap=node('label'),input=node('input');wrap.className='field';input.type='file';input.accept=accept;wrap.append(node('span',label),input);input.addEventListener('change',()=>{const file=input.files[0];if(!file)return;void task(async()=>{
  if(file.size>25*1024*1024)throw new Error('25MiB 이하의 파일을 선택해 주세요.');
  status('파일 검사 및 웹용 이미지 준비 중…');const response=await fetch('/__editor/upload',{method:'POST',headers:{'X-Editor-Token':token,'X-File-Name':encodeURIComponent(file.name)},body:file});const result=await response.json();if(!response.ok)throw new Error(result.error);
  apply(result,file);changed();renderFields();
});});$('fields').append(wrap);}
const exhibitChoices=()=>[...draft.projects.map(p=>['project:'+p.slug,'작품 · '+(p.title.ko||p.slug)]),...draft.media.map(m=>['media:'+m.id,'이미지 · '+(m.title.ko||m.id)]),['music:legacy','음악 · '+draft.music.title],...(draft.tracks||[]).map(t=>['music:'+t.id,'음악 · '+t.title])];
function worldItems(){const exhibits=(sceneWorld().exhibits||[]).map(e=>({id:e.id,name:(exhibitChoices().find(o=>o[0]===e.kind+':'+e.ref)?.[1]||e.ref)+' · '+e.id,type:'exhibit',point:e}));if(roomOwner)return exhibits;return [{id:'mascot',name:'마스코트',type:'character',point:draft.world.mascot},...(draft.world.sign?[{id:'welcome',name:'마을 간판',type:'sign',point:draft.world.sign}]:[]),{id:'noticeboard',name:'공고판',type:'board',point:draft.world.noticeboard},...draft.world.decorations.map(d=>({id:d.id,name:(d.type==='tree'?'나무':d.type==='letter'?'문자 '+d.char:'풀')+' · '+d.id,type:d.type,point:d})),...exhibits];}
function choices(){if(tab==='world')return worldItems();return tab==='music'?[{id:'legacy',title:draft.music.title},...(draft.tracks||[])]:draft[tab];}
function entry(){if(tab==='world')return worldItems().find(o=>o.id===selected);return tab==='music'?(selected==='legacy'?draft.music:draft.tracks.find(t=>t.id===selected)):draft[tab].find(i=>(i.id||i.slug)===selected);}
function renderPicker(){const values=choices();if(!values.some(i=>(i.id||i.slug)===selected))selected=values[0]?.id||values[0]?.slug||'';
  $('entry').replaceChildren(...values.map(i=>new Option(i.name||i.title?.ko||i.title?.en||i.title||i.id||i.slug,i.id||i.slug)));$('entry').value=selected;renderFields();}
function renderFields(){const item=entry();$('fields').replaceChildren();if(!item){$('fields').append(node('p','추가 버튼으로 새 항목을 만들어 주세요.'));return;}
  if(tab==='world'){
    $('fields').append(node('p','물체를 선택해 이동하세요. 타일·새 장식은 위 도구로 배치합니다.'));
    placementFields(item.point,item.type,item.id);
    if(item.type==='exhibit'){field('전시할 항목',item.point.kind+':'+item.point.ref,value=>{[item.point.kind,item.point.ref]=value.split(':');restoreScene();},{options:exhibitChoices()});const remove=node('button','전시물 삭제');remove.type='button';remove.addEventListener('click',()=>{sceneWorld().exhibits=sceneWorld().exhibits.filter(e=>e.id!==item.id);selected='';changed();renderPicker();restoreScene();});$('fields').append(remove);}
    if(item.type==='board'){const size=field('크기',item.point.size||1,value=>{if(value<.5||value>1.6)return false;item.point.size=value;restoreScene();},{type:'number'});size.min='.5';size.max='1.6';size.step='.05';}
    if(item.type==='letter'){field('문자',item.point.char,value=>{item.point.char=value;restoreScene();},{options:[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].map(c=>[c,c])});field('색상',item.point.color,value=>{item.point.color=value;restoreScene();},{type:'color'});}
    if(['tree','grass','letter'].includes(item.type)){const size=field('크기',item.point.size,value=>{item.point.size=value;restoreScene();},{type:'number'});size.min='.5';size.max='1.6';size.step='any';const remove=node('button','장식 삭제');remove.type='button';remove.addEventListener('click',()=>{draft.world.decorations=draft.world.decorations.filter(d=>d.id!==item.id);selected='';changed();renderPicker();void task(refresh);});$('fields').append(remove);}
  }else if(tab==='workers'){
    field('업체·개인 ID',item.id,value=>item.id=value,{required:true}).readOnly=true;field('이름',item.name,value=>item.name=value,{required:true});localFields('소개',item,'description',true);
    field('웹사이트',item.href||'',value=>{if(value)item.href=value;else delete item.href;});
    field('마을에 집 표시',item.house?'yes':'no',value=>{if(value==='yes'){try{item.house=findHouse(item.id);}catch(error){status(error.message,true);return false;}}else delete item.house;renderFields();restoreScene();},{options:[['yes','집 있음'],['no','집 없음']]});
    if(item.house){placementFields(item.house,'house',item.id);const edit=node('button','작업실 편집');edit.type='button';edit.addEventListener('click',()=>enterRoom(item.id));$('fields').append(edit);}
    field('벽면 로고',item.logoMediaId||'',value=>{if(value)item.logoMediaId=value;else delete item.logoMediaId;},{options:[['','없음'],...draft.media.map(m=>[m.id,m.title.ko||m.id])]});
    field('주크박스 음악',item.musicId||'',value=>{if(value)item.musicId=value;else delete item.musicId;},{options:[['','마을 기본곡'],...(draft.tracks||[]).map(t=>[t.id,t.title])]});
  }else if(tab==='projects'){
    field('작품 ID',item.slug,value=>item.slug=value,{required:true}).readOnly=true;localFields('제목',item,'title',true);localFields('소개',item,'summary',true);owners(item);
    field('분야',item.kind,value=>item.kind=value,{options:[['game','게임'],['music','음악'],['artwork','아트워크'],['site','웹사이트'],['experiment','실험']]});
    field('상태',item.status,value=>item.status=value,{options:[['in-progress','진행 중'],['shipped','완료'],['paused','보류']]});
    field('연도',item.year,value=>item.year=value);field('도구 (쉼표로 구분)',item.stack.join(', '),value=>item.stack=value.split(',').map(s=>s.trim()).filter(Boolean));field('태그 (쉼표로 구분)',(item.tags||[]).join(', '),value=>item.tags=value.split(',').map(s=>s.trim()).filter(Boolean));
    upload('대표 이미지 추가·교체','image/png,image/jpeg,image/webp,image/avif,image/gif',result=>item.thumbnail={src:result.preview,width:result.previewWidth,height:result.previewHeight,alt:clone(item.title),caption:{ko:'아트워크',en:'Artwork'}});
    if(item.thumbnail){const img=node('img');img.src=item.thumbnail.src;img.alt='대표 이미지 미리보기';$('fields').append(img);localFields('이미지 설명',item.thumbnail,'alt');}
    $('fields').append(node('h2','상세 소개'));for(const key of ['role','challenge','approach','outcome'])localFields({role:'역할',challenge:'소개',approach:'작업 과정',outcome:'현재 상태'}[key],item,key);
    for(const key of ['href','repo','steamUrl'])field({href:'공개 링크',repo:'소스 링크',steamUrl:'Steam 링크'}[key],item[key]||'',value=>{if(value)item[key]=value;else delete item[key];});
  }else if(tab==='media'){
    field('이미지 ID',item.id,value=>item.id=value,{required:true}).readOnly=true;localFields('제목',item,'title',true);owners(item);field('태그',item.tags.join(', '),value=>item.tags=value.split(',').map(s=>s.trim()).filter(Boolean));
    upload('아트워크 추가·교체','image/png,image/jpeg,image/webp,image/avif,image/gif',result=>Object.assign(item,{original:result.original,preview:result.preview,badge:result.badge,width:result.width,height:result.height,bytes:result.bytes}));
    if(item.preview){const img=node('img');img.src=item.preview;img.alt='아트워크 미리보기';$('fields').append(img);}
    $('fields').append(node('p','작은 미리보기는 자동 생성합니다. 원본은 클릭할 때만 로드됩니다.'));
  }else{
    if(selected!=='legacy')field('음악 ID',item.id,value=>item.id=value,{required:true}).readOnly=true;
    field('곡명',item.title,value=>item.title=value,{required:true});field('관련 프로젝트',item.project,value=>item.project=value,{required:true});field('작곡가·팀·회사',item.artist||'',value=>item.artist=value);field('길이 (초)',item.duration,value=>item.duration=value,{type:'number'});
    if(selected!=='legacy')owners(item);
    for(const ext of ['ogg','mp3'])upload(ext==='ogg'?'Opus Ogg 음원':'MP3 대체 음원','.'+ext,(result,file)=>{if(!file.name.toLowerCase().endsWith('.'+ext))throw new Error(ext+' 파일을 선택해 주세요.');item.sources[ext]=result.original;if(ext==='ogg')item.sourceSha256=result.sha256;});
    field('마을 기본곡',draft.musicId||'',value=>{if(value)draft.musicId=value;else delete draft.musicId;},{options:[['','기존 Sunlit Circuit'],...(draft.tracks||[]).map(t=>[t.id,t.title])]});
    const audio=node('audio');audio.controls=true;audio.preload='none';audio.src=item.sources.ogg||item.sources.mp3||'';$('fields').append(audio,node('p','두 형식을 등록한 뒤 저장하세요. 재생은 누를 때 시작합니다.'));
  }
}
function placementFields(point,type,id){
  const solid=['house','sign','board','tree','letter','exhibit'].includes(type),fallback=type==='house'?2:1;
  for(const key of ['x','y',...(solid?['width','depth']:[])]){
    const coordinate=['x','y'].includes(key),label=coordinate?(type==='house'?'집 ':'')+key.toUpperCase():key==='width'?'점유 너비 (칸)':'점유 깊이 (칸)';
    const input=field(label,point[key]??fallback,value=>{
      const next={...point,[key]:value},error=objectPlacementError(type==='exhibit'&&roomOwner?roomCatalog(draft,roomOwner,roomIndex):draft,type,id,next);
      if(error){input.value=point[key]??fallback;status(error,true);return false;}
      Object.assign(point,next);restoreScene();
    },{type:'number'});
    input.min=coordinate?(draft.world.layoutVersion===2?'-64':'0'):'1';input.max=draft.world.layoutVersion===2?'64':coordinate?'23':'24';
    if(coordinate){input.dataset.coordinate=key;if(!['house','board','tree','letter'].includes(type))input.step='any';}
  }
  field('좌우 방향',point.flip?'flipped':'normal',value=>{const next={...point,flip:value==='flipped'},error=objectPlacementError(type==='exhibit'&&roomOwner?roomCatalog(draft,roomOwner,roomIndex):draft,type,id,next);if(error){status(error,true);return false;}Object.assign(point,next);restoreScene();},{options:[['normal','기본'],['flipped','좌우 반전']]});
  if(solid)$('fields').append(node('p','X/Y는 앞쪽 기준 칸입니다. 그림의 바닥 중심과 점유 영역의 중심이 함께 이동합니다.'));
}
function findHouse(id){for(const {x,y} of draft.world.tiles)if(!placementError(draft.workers,id,{x,y},draft.world))return{x,y,width:2,depth:2};throw new Error('빈 집 자리를 찾지 못했습니다.');}
function add(){if(tab==='world'){selectTool(roomOwner?'exhibit':'tree');status('마을의 잔디를 클릭해 나무를 놓으세요.');return;}const values=choices(),prefix={workers:'studio',projects:'work',media:'art',music:'music'}[tab];let n=1;while(values.some(i=>(i.id||i.slug)===prefix+'-'+n))n++;const id=prefix+'-'+n,owner=draft.workers.find(w=>w.id===selected)?.id||draft.workers[0].id;
  if(tab==='workers')draft.workers.push({id,name:'새 업체',description:{ko:'',en:''},house:findHouse(id)});
  else if(tab==='projects')draft.projects.push({slug:id,year:String(new Date().getFullYear()),stack:[],tags:[],kind:'game',status:'in-progress',workerIds:[owner],...Object.fromEntries(['title','summary','role','challenge','approach','outcome'].map(k=>[k,{ko:'',en:''}]))});
  else if(tab==='media')draft.media.push({id,workerIds:[owner],tags:[],title:{ko:'',en:''},original:'',preview:'',badge:'',bytes:0,width:0,height:0});
  else{draft.tracks??=[];draft.tracks.push({id,title:'새 음악',project:'',duration:64,sourceSha256:'',sources:{ogg:'',mp3:''},workerIds:[owner]});}
  selected=id;changed();renderPicker();
}
async function load(){const result=await(await fetch('/__editor/catalog')).json();draft=result.catalog;draft.world=villageWorld(draft);revision=result.revision;saved=JSON.stringify(draft);history.reset(draft);dirty=false;roomOwner=null;roomIndex=0;roomControls();$('display-ref').replaceChildren(...exhibitChoices().map(([id,title])=>new Option(title,id)));renderPicker();await refresh();status('저장본을 불러왔습니다. 장면 도구 또는 오른쪽 항목을 편집하세요.');}
$('fields').addEventListener('submit',e=>e.preventDefault());
$('tabs').addEventListener('click',e=>{const button=e.target.closest('[data-tab]');if(!button)return;tab=button.dataset.tab;selected='';$('tabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderPicker();});
$('entry').addEventListener('change',()=>{selected=$('entry').value;renderFields();restoreScene();});$('add').addEventListener('click',add);
$('preview').addEventListener('click',()=>{if($('fields').reportValidity())void task(async()=>{await refresh();status(dirty?'저장 전 · 미리보기를 갱신했습니다.':'미리보기를 갱신했습니다.');});});
$('save').addEventListener('click',()=>{if($('fields').reportValidity())void task(async()=>{const result=await api('save',{catalog:draft,revision});revision=result.revision;saved=JSON.stringify(draft);dirty=false;await refresh();status('저장했습니다. 이전 저장본은 자동 백업했습니다.');});});
$('deploy').addEventListener('click',()=>void task(async()=>{if(dirty)throw new Error('변경 사항을 먼저 저장해 주세요.');status('저장한 콘텐츠만 공개 배포 중…');const result=await api('deploy',{revision});$('logs').querySelector('pre').textContent=result.log;$('logs').open=true;status('콘텐츠 배포 완료 · 공개 사이트를 새로고침하면 약 1분 안에 반영됩니다.');}));
$('reload').addEventListener('click',()=>{if(dirty)$('discard').showModal();else void task(load);});
$('discard-cancel').addEventListener('click',()=>$('discard').close());
$('discard-confirm').addEventListener('click',()=>{$('discard').close();void task(load);});
$('proposal-import').addEventListener('change',event=>{const file=event.target.files[0];if(!file)return;void task(async()=>{
  if(file.size>256*1024)throw new Error('변경안은 256KiB 이하여야 합니다.');
  const proposal=JSON.parse(await file.text()),bytes=new TextEncoder().encode(JSON.stringify(studioSlice(draft,proposal.owner))),digest=await crypto.subtle.digest('SHA-256',bytes);
  const baseHash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  if(baseHash!==proposal.baseHash)throw new Error('기준 승인본이 다릅니다. 현재 수정 사항을 보존한 뒤 변경안을 재검토해 주세요.');
  const next=mergeStudio(draft,proposal.owner,proposal.payload);await api('preview',{catalog:next});draft=next;changed();renderPicker();restoreScene();enterRoom(proposal.owner);status('변경안을 미리보기에 가져왔습니다. 검토 후 저장·콘텐츠 배포하세요.');
}).finally(()=>{event.target.value='';});});
function syncTools(){if(frameReady)$('map').contentWindow.postMessage({source:'induo-editor',arranging:$('arrange').checked,tool,grid:$('grid').checked,exhibit:$('display-ref').value,char:$('letter-char').value,color:$('letter-color').value,theme:document.documentElement.dataset.theme},location.origin);}
for(const id of ['arrange','grid','letter-char','letter-color','display-ref'])$(id).addEventListener('change',syncTools);
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('map').contentWindow||event.data?.source!=='induo-map')return;const message=event.data;
  if(message.type==='ready'){frameReady=true;syncTools();restoreScene();if(roomOwner)enterRoom(roomOwner,roomIndex);}
  if(message.type==='area'){roomOwner=message.owner||null;roomIndex=message.level||0;roomControls();if(roomOwner){tab='world';selected='';$('tabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));}if(tab==='world')renderPicker();if(!roomOwner)syncTools();}
  if(message.type==='roomAction'&&!busy&&roomOwner&&message.owner===roomOwner)roomAction(message.action,message.value);
  // Local scene edits are confined to the room currently entered; authentication stays server-side work.
  if(['tile','move','exhibitAdd','exhibitRemove'].includes(message.type)&&((message.owner||null)!==roomOwner||roomOwner&&(message.level!==roomIndex||message.type==='move'&&message.kind!=='exhibit')))return;
  if(roomOwner&&['decorationAdd','decorationRemove'].includes(message.type))return;
  if(message.type==='begin'&&!busy)history.begin();
  if(message.type==='end'&&!busy){history.end(draft);controls();}
  if(message.type==='history')travel(message.action);
  if(message.type==='select'){tab=message.kind==='house'?'workers':'world';selected=message.id;$('tabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));renderPicker();roomControls();}
  if(message.type==='move'&&!busy){const point=message.kind==='house'?draft.workers.find(w=>w.id===message.id).house:worldItems().find(o=>o.id===message.id)?.point;if(!point)return;Object.assign(point,{x:message.x,y:message.y});changed();for(const key of ['x','y']){const input=$('fields').querySelector('[data-coordinate='+key+']');if(input)input.value=message[key];}status(message.id+' · '+message.x+', '+message.y+' · 저장되지 않음');}
  if(message.type==='tile'&&!busy){setTerrain(sceneTarget(message.owner,message.level),message.x,message.y,message.terrain);changed();}
  if(message.type==='exhibitAdd'&&!busy){const world=sceneTarget(message.owner,message.level);world.exhibits??=[];world.exhibits.push(message.object);changed();}
  if(message.type==='exhibitRemove'&&!busy){const world=sceneTarget(message.owner,message.level);world.exhibits=world.exhibits.filter(e=>e.id!==message.id);changed();renderPicker();}
  if(message.type==='decorationAdd'&&!busy){draft.world.decorations.push(message.object);changed();}
  if(message.type==='decorationRemove'&&!busy){draft.world.decorations=draft.world.decorations.filter(d=>d.id!==message.id);if(tab==='world')renderPicker();changed();}
  if(message.type==='hint')status(message.error,true);
});
window.addEventListener('beforeunload',event=>{if(dirty)event.preventDefault();});
void task(load);

function selectTool(value){tool=value;$('letter-settings').hidden=tool!=='letter';$('display-settings').hidden=tool!=='exhibit';if(tool==='exhibit'){const value=$('display-ref').value;$('display-ref').replaceChildren(...exhibitChoices().map(([id,title])=>new Option(title,id)));if([...$('display-ref').options].some(o=>o.value===value))$('display-ref').value=value;}$('tools').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));syncTools();}
$('tools').addEventListener('click',event=>{const button=event.target.closest('[data-tool]');if(button)selectTool(button.dataset.tool);});
window.addEventListener('editor-theme',syncTools);
function restoreScene(){if(frameReady)$('map').contentWindow.postMessage({source:'induo-editor',type:'restore',catalog:draft,selection:['workers','world'].includes(tab)?selected:''},location.origin);}
function travel(action){
  if(busy||!draft||!['undo','redo'].includes(action))return;
  const next=history[action](draft);if(!next)return;
  draft=next;if(roomOwner){const w=draft.workers.find(w=>w.id===roomOwner);if(!w?.house)roomOwner=null;else roomIndex=Math.min(roomIndex,roomFloors(w).length-1);}roomControls();dirty=JSON.stringify(draft)!==saved;renderPicker();restoreScene();controls();
  status((action==='undo'?'실행 취소':'다시 실행')+' · '+(dirty?'저장되지 않은 변경':'저장본과 같습니다.'));
}
for(const action of ['undo','redo'])$(action).addEventListener('click',()=>travel(action));
window.addEventListener('keydown',event=>{const action=historyShortcut(event);if(action){event.preventDefault();travel(action);}});
$('fields').addEventListener('focusin',event=>{if(event.target.matches('input:not([type=file]),textarea,select'))history.begin();});
$('fields').addEventListener('focusout',()=>{if(draft){history.end(draft);controls();}});

function enterRoom(owner,level=0){if(frameReady)$('map').contentWindow.postMessage({source:'induo-editor',type:'enterRoom',owner,level},location.origin);}
function roomAction(action,value){
  if(!roomOwner)return;
  if(action==='reference'){
    const point=sceneWorld().exhibits?.find(e=>e.id===selected);if(!point||!exhibitChoices().some(([id])=>id===value))return;
    [point.kind,point.ref]=value.split(':');changed();restoreScene();
  }
  if(action==='placement'){
    const point=sceneWorld().exhibits?.find(e=>e.id===selected);if(!point||!['width','depth','flip'].includes(value?.key))return;
    const next={...point,[value.key]:value.value};
    const error=objectPlacementError(roomCatalog(draft,roomOwner,roomIndex),'exhibit',point.id,next);
    if(error){status(error,true);roomControls();return;}
    Object.assign(point,next);changed();restoreScene();
  }
  if(action==='wall-height'){
    if(!Number.isInteger(value)||value<24||value>240){status('벽 높이는 24–240 사이의 정수로 설정해 주세요.',true);return;}
    ensureRoom().floors[roomIndex].wallHeight=value;changed();restoreScene();
  }
  if(action==='add-floor'){
    const room=ensureRoom();if(room.floors.length>=3)return;
    room.floors.push({wallHeight:90,tiles:[{x:0,y:0,type:'floor'}],exhibits:[]});roomIndex=room.floors.length-1;changed();restoreScene();enterRoom(roomOwner,roomIndex);roomControls();
  }
  if(action==='remove-floor'){
    if(roomIndex===0)return;const room=ensureRoom();room.floors.splice(roomIndex,1);roomIndex=Math.min(roomIndex,room.floors.length-1);selected='';changed();restoreScene();enterRoom(roomOwner,roomIndex);roomControls();
  }
}
