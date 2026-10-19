import {soundtrackChoices} from '../src/scripts/village-tracks.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHistory,historyShortcut} from './editor/history.mjs';
import {roomElevation} from '../src/scripts/village-room.mjs';
import {toScreen} from '../src/scripts/village-camera.mjs';
import {villageSlice,mergeVillage} from '../src/server/studio-village-layout.mjs';
import {studioSlice,mergeStudio} from '../src/server/studio-content.mjs';
import {roomCatalog,objectPlacementError,paintError,placementObjects,placementCells} from './editor-placement.mjs';
import {setTerrain,terrainAt,groundPosition,terrainBounds} from '../src/scripts/village-world.mjs';
import {villageContent} from '../src/scripts/village-content.mjs';
import {CONTENT_ORIGIN,resolveMedia} from '../src/content-schema.mjs';
const catalog=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8'));
const source=(await readFile(new URL('../src/scripts/village-participant.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export async function','async function');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.events={};this.dataset={};this.attributes={};this.value='';this.hidden=false;this.style={setProperty(){},removeProperty(){}};this.classList={toggle:(key,value)=>this.attributes[key]=value};}
  focus(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  insertBefore(item,before){this.children.splice(this.children.indexOf(before),0,item);}
  setAttribute(key,value){this.attributes[key]=value;}
  getAttribute(key){return this.attributes[key];}
  addEventListener(name,fn){this.events[name]=fn;}
  querySelectorAll(){return this.children.flatMap(child=>[child,...(child.querySelectorAll?.()||[])]).filter(child=>['button','input','select','textarea'].includes(child.tag));}
}
const elements=root=>[root,...root.children.flatMap(child=>elements(child))];
async function setup(response,previewMode=false,saveResponse,accountOnly=false){
  const scene=new Element('scene');scene.setPointerCapture=()=>{};const handlers={},writes=[],documentHandlers={},ghosts=[];let preview,area='village',worker=null,level=0;
  const api={ctx:new Proxy({globalAlpha:1},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)}),previewPlacement:(...args)=>ghosts.push(args),accountOnly,floorBar:new Element('nav'),editorUI(label,editing){this.toolLabel=label;this.editing=editing;},preview:previewMode,catalog,point:event=>event.point,scene,canvas:{focus(){}},root:{dataset:{workers:JSON.stringify([{id:'frondward',name:'Frondward'}])}},requestDraw(){},closePopup(){},state:()=>({area,worker,level,scale:1}),apply(data){preview=data;},enter(owner,index=0){area='room';worker=preview.workers.find(w=>w.id===owner);level=index;}};
  const context={roomElevation,toScreen,AbortSignal,villageContent,clearTimeout,roomCatalog,objectPlacementError,paintError,placementObjects,placementCells,setTerrain,terrainAt,groundPosition,terrainBounds,api,createHistory,historyShortcut,soundtrackChoices,studioSlice,mergeStudio,CONTENT_ORIGIN,resolveMedia,structuredClone,crypto:{getRandomValues:array=>crypto.getRandomValues(array)},URL,URLSearchParams,location:{search:''},Blob,Response,setTimeout,
    document:{addEventListener(type,fn){documentHandlers[type]=fn;},documentElement:new Element('html'),createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},window:{addEventListener(type,fn){handlers[type]=fn;}},Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}},
    fetch:async(url,options)=>{if(response&&options?.method!=='POST')return response(url);if(url.includes('/session'))return Response.json({id:'test',name:'Test',owners:['frondward'],host:false});if(options?.method==='POST'){writes.push({url,payload:JSON.parse(options.body)});return saveResponse?saveResponse():Response.json({revision:1});}return Response.json({catalog,payload:studioSlice(catalog,'frondward'),revision:0,baseHash:'base',stale:false});}};
  const editor=await vm.runInNewContext(source+'\ncreateParticipantEditor(api);',context);
  const button=text=>elements(scene).find(el=>el.tag==='button'&&el.textContent===text);
  return{scene,api,editor,writes,ghosts,handlers,documentHandlers,button,preview:()=>preview};
}
test('scene editor only places registered own works, preserves catalog data and publishes only room layout',async()=>{
  const payload=studioSlice(catalog,'frondward'),privateWork={...payload.projects[0],slug:'private-only',title:{ko:'비공개 새작품',en:'Private'}};payload.projects.push(privateWork);
  const ui=await setup(url=>url.includes('/session')?Response.json({owners:['frondward'],host:false}):Response.json({catalog,payload,revision:0,baseHash:'base',stale:false}));
  assert.equal(ui.button('Works'),undefined);assert.equal(ui.button('이미지'),undefined);assert.equal(ui.button('음악'),undefined);assert.equal(ui.button('꾸미기'),undefined);assert.equal(ui.button('비공개 새작품'),undefined);
  assert.equal(ui.button('GRENCH BOSS'),undefined);assert.equal(ui.button('Induo Works 웹사이트'),undefined);
  assert.equal(ui.button('배치 공개'),undefined);
  elements(ui.api.floorBar).find(el=>el.className==='floor-height').events.click();
  await ui.editor.close();
  assert.equal(ui.writes.length,1);assert.deepEqual(Object.keys(ui.writes[0].payload).sort(),['revision','room']);assert.equal(ui.writes[0].payload.room.floors.length,payload.room.floors.length);
  assert.deepEqual(ui.preview().world,catalog.world);await ui.editor.close();assert.equal(ui.scene.children[0].hidden,true);await ui.editor.open();assert.equal(ui.scene.children[0].hidden,false);
});

test('unauthenticated scene stays closed and never exposes the editing tools',async()=>{
  const ui=await setup(()=>Response.json({error:'Discord 로그인이 필요합니다.'},{status:401}));
  assert.equal(ui.scene.children[0].hidden,true);assert.equal(ui.button('배치 공개'),undefined);
});

test('participant settings preserve independent full-screen state and collapse the picker after selection',async()=>{
  const ui=await setup();assert.equal(ui.scene.attributes['studio-fullscreen'],undefined);
  await ui.editor.close();assert.equal(ui.scene.attributes['studio-fullscreen'],undefined);
  await ui.editor.open();assert.equal(ui.scene.attributes['studio-fullscreen'],undefined);
  assert.equal(elements(ui.scene).some(e=>e.tag==='details'),false);
  const add=elements(ui.scene).find(e=>e.attributes['aria-label']==='물건 놓기');add.events.click();
  assert.ok(elements(ui.scene).some(e=>e.attributes['aria-label']==='물건 종류'));
  elements(ui.scene).find(e=>e.attributes['aria-label']==='주크박스').events.click();
  assert.equal(elements(ui.scene).some(e=>e.attributes['aria-label']==='물건 종류'),false);
  assert.equal(ui.writes.length,0);
});


test('a first drag moves an unselected exhibit immediately and undo restores it',async()=>{
  const payload=studioSlice(catalog,'frondward');payload.room.floors[0].exhibits.push({id:'test-display',kind:'music',ref:'legacy',x:0,y:0,width:1,depth:1});
  const ui=await setup(url=>url.includes('/session')?Response.json({owners:['frondward'],host:false}):Response.json({catalog,payload,revision:0,baseHash:'base',stale:false}));
  const event=(x,y)=>({button:0,pointerId:1,clientX:x*10,clientY:y*10,point:{x,y},target:{closest:()=>({dataset:{object:'display:frondward:0:test-display'}})},preventDefault(){},stopImmediatePropagation(){}});
  // UI targets are excluded from map gestures; the fixture only matches object selectors.
  const e=(x,y)=>{const value=event(x,y);value.target.closest=selector=>selector==='[data-object]'?{dataset:{object:'display:frondward:0:test-display'}}:null;return value;};
  ui.scene.events.pointerdown(e(0,0));ui.scene.events.pointermove(e(1,0));ui.scene.events.pointerup(e(1,0));
  const position=()=>ui.preview().workers.find(w=>w.id==='frondward').room.floors[0].exhibits[0].x;
  assert.equal(position(),1);
  ui.scene.events.pointerdown(e(1,0));ui.scene.events.pointerup(e(1,0));assert.equal(position(),1,elements(ui.scene).filter(e=>e.attributes.role==="status").map(e=>e.textContent).join(" | "));
  let blocked=false;ui.scene.events.click({target:{closest:()=>true},stopImmediatePropagation(){blocked=true;}});assert.equal(blocked,false);
  ui.editor.undo();assert.equal(position(),0);
  assert.deepEqual(ui.preview().world,catalog.world);
});


test('home shortcut opens the owned room and hides settings without saving or changing full screen',async()=>{
  const ui=await setup();await ui.editor.home();assert.equal(ui.scene.children[0].hidden,true);assert.equal(ui.api.state().worker.id,'frondward');assert.equal(ui.writes.length,0);assert.equal(ui.scene.attributes['studio-fullscreen'],undefined);
});

test('independent scene view toggles full screen and restores pre-existing inert values',async()=>{
  const scene=new Element('scene'),button=new Element('button'),sibling={inert:true};
  scene.parentElement={children:[scene,sibling]};scene.parentElement.parentElement=null;
  const root=new Element('html'),code=(await readFile(new URL('../src/scripts/village-view.mjs',import.meta.url),'utf8')).replace('export function','function');
  const view=vm.runInNewContext(code+';createSceneView(scene,button)',{scene,button,document:{addEventListener(type,fn){documentHandlers[type]=fn;},documentElement:root}});
  view.toggle();assert.equal(scene.attributes['studio-fullscreen'],true);assert.equal(button.attributes['aria-pressed'],'true');assert.equal(sibling.inert,true);
  view.close();view.close();assert.equal(scene.attributes['studio-fullscreen'],false);assert.equal(sibling.inert,true);assert.equal(root.attributes['studio-open'],false);
});


test('LAN scene preview uses only public content and offers no real draft write or submit action',async()=>{
  const ui=await setup(()=>{throw Error('Preview must not call studio APIs');},true);
  assert.equal(ui.button('GRENCH BOSS'),undefined);assert.equal(ui.button('배치 공개'),undefined);assert.equal(ui.button('검토 요청'),undefined);assert.equal(ui.writes.length,0);
  ui.handlers.beforeunload({preventDefault(){throw Error('Disposable preview should not block refresh');}});
});


test('floor navigation leaves the toolbar, active tool labels and undo use the location HUD',async()=>{
  const ui=await setup();assert.equal(ui.api.toolLabel,'선택·이동');assert.equal(ui.editor.isEditing,true);
  assert.equal(elements(ui.scene).some(e=>e.attributes['aria-label']==='다시 실행'),false);
  assert.equal(elements(ui.scene).some(e=>e.attributes['aria-label']==='층·공간'),false);
  const add=elements(ui.api.floorBar).find(e=>e.attributes['aria-label']==='층 추가');add.events.click();
  assert.equal(ui.api.state().level,1);
  assert.ok(elements(ui.api.floorBar).some(e=>e.className==='floor-height'));
  assert.ok(elements(ui.api.floorBar).some(e=>e.attributes['aria-label']==='층 삭제'));
  ui.editor.undo();assert.equal(ui.preview().workers.find(w=>w.id==='frondward').room.floors.length,1);
  elements(ui.scene).find(e=>e.attributes['aria-label']==='타일 놓기').events.click();elements(ui.scene).find(e=>e.attributes['aria-label']==='투명 타일').events.click();assert.equal(ui.api.toolLabel,'투명 타일');
  await ui.editor.close();assert.equal(ui.api.editing,false);
});

test('erase removes legacy automatic displays and undo restores them without deleting the work',async()=>{
  const ui=await setup(),id='frondward:grench-boss';
  const event={button:0,pointerId:1,clientX:0,clientY:0,point:{x:1,y:7},target:{closest:s=>s==='[data-object]'?{dataset:{object:id}}:null},preventDefault(){},stopImmediatePropagation(){}};
  ui.scene.events.pointerdown(event);ui.scene.events.pointerup(event);
  elements(ui.scene).find(e=>e.attributes['aria-label']==='삭제').events.click();
  assert.equal(villageContent(ui.preview(),'ko','').places.some(p=>p.id===id),false);
  assert.ok(ui.preview().projects.some(p=>p.slug==='grench-boss'));
  ui.editor.undo();assert.equal(villageContent(ui.preview(),'ko','').places.some(p=>p.id===id),true);
});


test('exit skips unchanged layouts, saves once after edits and keeps the editor open on failure',async()=>{
 const ui=await setup();assert.equal(await ui.editor.close(),true);assert.equal(ui.writes.length,0);await ui.editor.open();
 const wall=elements(ui.api.floorBar).find(e=>e.className==='floor-height');wall.events.click();
 const exits=await Promise.all([ui.editor.close(),ui.editor.close()]);assert.deepEqual(exits,[true,true]);assert.equal(ui.writes.length,1);assert.equal(ui.editor.isOpen,false);
 await ui.editor.open();await ui.editor.close();assert.equal(ui.writes.length,1);
 const failed=await setup(undefined,false,()=>Response.json({error:'연결 실패'},{status:503}));
 const input=elements(failed.api.floorBar).find(e=>e.className==='floor-height');input.events.click();
 assert.equal(await failed.editor.close(),false);assert.equal(failed.editor.isOpen,true);assert.equal(failed.preview().workers.find(w=>w.id==='frondward').room.floors[0].wallHeight,140);
});

test('floor removal requires a separate confirmation; cancel preserves the floor and undo restores deletion',async()=>{
 const ui=await setup();elements(ui.api.floorBar).find(e=>e.attributes['aria-label']==='층 추가').events.click();
 const open=()=>elements(ui.api.floorBar).find(e=>e.attributes['aria-label']==='층 삭제').events.click();
 open();const dialog=ui.scene.children[0].children.find(e=>e.tag==='dialog');assert.equal(dialog.open,true);ui.button('취소').events.click();assert.equal(ui.preview().workers.find(w=>w.id==='frondward').room.floors.length,2);
 open();ui.button('삭제').events.click();assert.equal(ui.preview().workers.find(w=>w.id==='frondward').room.floors.length,1);ui.editor.undo();assert.equal(ui.preview().workers.find(w=>w.id==='frondward').room.floors.length,2);
});

test('internal navigation waits for exit save and aborts navigation when saving fails',async()=>{
 for(const fail of [false,true]){
  const ui=await setup(undefined,false,()=>Response.json(fail?{error:'실패'}:{revision:1},{status:fail?503:200}));
  const wall=elements(ui.api.floorBar).find(e=>e.className==='floor-height');wall.events.click();
  let loaded=false,canceled=false;const event={loader:async()=>{loaded=true;},preventDefault(){canceled=true;}};
  ui.documentHandlers['astro:before-preparation'](event);await event.loader();assert.equal(loaded,!fail);assert.equal(canceled,fail);assert.equal(ui.writes.length,1);
 }
});


test('account menu toggles outside editing without entering a room or loading its layout',async()=>{
 let rooms=0;
 const ui=await setup(url=>{if(url.includes('/session'))return Response.json({owners:['frondward'],host:false});rooms++;return Response.json({catalog,payload:studioSlice(catalog,'frondward'),revision:0});},false,undefined,true);
 assert.equal(rooms,0);assert.equal(ui.editor.isOpen,false);assert.equal(ui.api.state().area,'village');
 const account=ui.scene.children.find(e=>e.className==='participant-top');assert.ok(account);assert.equal(account.hidden,true);
 ui.editor.toggleAccount();assert.equal(account.hidden,false);assert.ok(ui.button('로그아웃'));assert.equal(ui.editor.isEditing,false);
 ui.editor.toggleAccount();assert.equal(account.hidden,true);await ui.editor.open();assert.equal(rooms,1);assert.equal(ui.editor.isEditing,true);assert.equal(account.hidden,true);
 await ui.editor.close();ui.editor.toggleAccount();assert.equal(account.hidden,false);assert.equal(ui.writes.length,0);
});


test('reopening clears the selected exhibit panel and tile/erase tools work after leaving a selection',async()=>{
 const payload=studioSlice(catalog,'frondward');payload.room.floors[0].exhibits.push({id:'test-display',kind:'music',ref:'legacy',x:0,y:0,width:1,depth:1});
 const ui=await setup(url=>url.includes('/session')?Response.json({owners:['frondward'],host:false}):Response.json({catalog,payload,revision:0}));
 const event=(x,y,id)=>({button:0,pointerId:1,clientX:x*10,clientY:y*10,point:{x,y},target:{closest:selector=>selector==='[data-object]'&&id?{dataset:{object:id}}:null},preventDefault(){},stopImmediatePropagation(){}});
 let e=event(0,0,'display:frondward:0:test-display');ui.scene.events.pointerdown(e);ui.scene.events.pointerup(e);
 assert.ok(elements(ui.scene).some(el=>el.className==='participant-subtools participant-selection'));assert.equal(elements(ui.scene).some(el=>el.type==='number'||el.textContent==='너비'||el.textContent==='깊이'),false);
 await ui.editor.close();await ui.editor.open();assert.equal(elements(ui.scene).some(el=>el.className==='participant-subtools participant-selection'),false);assert.equal(ui.api.toolLabel,'선택·이동');
 elements(ui.scene).find(el=>el.attributes['aria-label']==='타일 놓기').events.click();e=event(-1,0);ui.scene.events.pointerdown(e);ui.scene.events.pointerup(e);
 assert.ok(ui.preview().workers.find(w=>w.id==='frondward').room.floors[0].tiles.some(t=>t.x===-1&&t.y===0));
 elements(ui.scene).find(el=>el.attributes['aria-label']==='선택·이동').events.click();e=event(0,0,'display:frondward:0:test-display');ui.scene.events.pointerdown(e);ui.scene.events.pointerup(e);elements(ui.scene).find(el=>el.attributes['aria-label']==='삭제').events.click();
 assert.equal(ui.preview().workers.find(w=>w.id==='frondward').room.floors[0].exhibits.length,0);
});


test('plain HTTP preview can place a registered exhibit without secure-context randomUUID',async()=>{
 const ui=await setup(undefined,true);elements(ui.scene).find(e=>e.attributes['aria-label']==='물건 놓기').events.click();elements(ui.scene).find(e=>e.attributes['aria-label']==='주크박스').events.click();
 const event={button:0,pointerId:1,clientX:0,clientY:0,point:{x:0,y:0},target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){}};
 ui.scene.events.pointerdown(event);ui.scene.events.pointerup(event);
 const item=ui.preview().workers.find(w=>w.id==='frondward').room.floors[0].exhibits.at(-1);assert.match(item.id,/^display-[0-9a-f]{8}$/);assert.equal(item.kind,'music');assert.equal(ui.writes.length,0);
});


test('full-screen scene follows the visible viewport through zoom, keyboard and panning and cleans up',async()=>{
 const scene=new Element('scene'),button=new Element('button'),root=new Element('html'),handlers={},styles=new Map();
 scene.style={setProperty:(key,value)=>styles.set(key,value),removeProperty:key=>styles.delete(key)};scene.parentElement={children:[scene],parentElement:null};
 const viewport={offsetLeft:0,offsetTop:0,width:390,height:740,addEventListener:(type,fn)=>handlers[type]=fn,removeEventListener:type=>delete handlers[type]};
 const source=(await readFile(new URL('../src/scripts/village-view.mjs',import.meta.url),'utf8')).replace('export function','function');
 const view=vm.runInNewContext(source+';createSceneView(scene,button,viewport)',{scene,button,viewport,document:{documentElement:root}});
 view.toggle();assert.equal(styles.get('--scene-view-height'),'740px');
 Object.assign(viewport,{offsetLeft:45,offsetTop:120,width:260,height:300});handlers.resize();assert.equal(styles.get('--scene-view-height'),'300px');assert.equal(styles.get('--scene-view-left'),'45px');
 viewport.offsetTop=180;handlers.scroll();assert.equal(styles.get('--scene-view-top'),'180px');
 view.close();assert.equal(styles.size,0);view.dispose();assert.deepEqual(Object.keys(handlers),[]);
});

test('guestbook loads on opening, renders text safely, posts then disposes requests',async()=>{
 const source=await readFile(new URL('../src/scripts/village-guestbook.js',import.meta.url),'utf8'),container=new Element('div'),calls=[];
 const context={document:{documentElement:{lang:'ko'},createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},AbortController,encodeURIComponent,Date,fetch:async(url,options)=>{calls.push({url,options});return Response.json({canWrite:true,entries:options.method==='POST'?[{id:'a',name:'Visitor',message:'<img src=x>',created:1,canDelete:true}]:[],next:null});}};
 const dispose=vm.runInNewContext(source.replace('export function','function')+';mountGuestbook;',context)(container,'frondward');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);
 const form=elements(container).find(e=>e.tag==='form'),input=elements(form).find(e=>e.tag==='textarea');input.value='hello';
 await form.events.submit({preventDefault(){}});assert.equal(JSON.parse(calls[1].options.body).message,'hello');assert.ok(elements(container).some(e=>e.textContent==='<img src=x>'));assert.equal(elements(container).some(e=>e.tag==='img'),false);
 dispose();assert.equal(calls[0].options.signal.aborted,true);
});

test('guestbook previews a distinct team badge and toggles name hiding without accepting a typed identity',async()=>{
 const source=await readFile(new URL('../src/scripts/village-guestbook.js',import.meta.url),'utf8'),container=new Element('div'),calls=[];
 const identity={name:'Server nickname',teams:[{id:'frondward',name:'Frondward'}]};
 const context={document:{documentElement:{lang:'ko'},createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},AbortController,encodeURIComponent,Date,fetch:async(_url,options)=>{calls.push(options);return Response.json({canWrite:true,identity,entries:[],next:null});}};
 const dispose=vm.runInNewContext(source.replace('export function','function')+';mountGuestbook;',context)(container,'frondward');
 await new Promise(resolve=>setImmediate(resolve));
 const select=elements(container).find(e=>e.tag==='select'),hide=elements(container).find(e=>e.tag==='input'),preview=elements(container).find(e=>e.className==='guestbook-identity');
 assert.equal(select.attributes['aria-label'],'표시할 소속');assert.ok(elements(preview).some(e=>e.className==='guestbook-send'));const nameGroup=elements(preview).find(e=>e.className==='guestbook-name-group');assert.ok(nameGroup.children.some(e=>e.tag==='strong'));assert.ok(nameGroup.children.some(e=>e.className==='guestbook-hide'));
 assert.equal(elements(preview).filter(e=>e.tag==='select').length,1);assert.equal(elements(preview).filter(e=>e.tag==='strong').length,1);assert.ok(elements(preview).some(e=>e.textContent==='Server nickname'));assert.equal(elements(preview).some(e=>e.tag==='span'&&e.className==='guestbook-team'),false);
 hide.checked=true;hide.events.change();assert.equal(elements(preview).find(e=>e.tag==='strong').hidden,true);
 const form=elements(container).find(e=>e.tag==='form');elements(form).find(e=>e.tag==='textarea').value='Hello';await form.events.submit({preventDefault(){}});
 assert.deepEqual(JSON.parse(calls[1].body),{message:'Hello',team:'frondward',hideName:true,email:'',shareDiscord:false});
 const currentSelect=elements(container).find(e=>e.tag==='select'),currentHide=elements(container).find(e=>e.tag==='input');currentSelect.value='';currentSelect.events.change();assert.equal(currentHide.disabled,true);assert.equal(currentHide.checked,false);dispose();
});

test('guestbook team menu links to filtered Works and Worker, visits inside the scene and replies target the parent',async()=>{
 const source=await readFile(new URL('../src/scripts/village-guestbook.js',import.meta.url),'utf8'),container=new Element('div'),calls=[],visits=[];
 const root={id:'12345678-1234-1234-1234-123456789012',name:'Visitor',message:'Hello',created:1,author_team_name:'Frondward',team:{id:'frondward',hasHouse:true},replies:[{id:'reply',name:'Another visitor',message:'Reply text',created:2}]};
 const context={document:{documentElement:{lang:'ko'},createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},AbortController,encodeURIComponent,Date,fetch:async(_url,options)=>{calls.push(options);return Response.json({canWrite:true,identity:{name:'Me',teams:[]},entries:[root],next:null});}};
 const dispose=vm.runInNewContext(source.replace('export function','function')+';mountGuestbook;',context)(container,'frondward',{visit:id=>visits.push(id)});
 await new Promise(resolve=>setImmediate(resolve));
 const summary=elements(container).find(e=>e.tag==='summary');assert.equal(elements(summary).some(e=>e.className==='guestbook-chevron'),false);
 const links=elements(container).filter(e=>e.tag==='a');assert.ok(links.every(a=>elements(a).some(e=>e.tag==='svg')));assert.deepEqual(links.map(a=>a.href),['/ko/?worker=frondward','/ko/work/?worker=frondward','/ko/workers/#frondward']);links[0].events.click({preventDefault(){}});assert.deepEqual(visits,['frondward']);
 assert.equal(elements(container).filter(e=>e.className==='guestbook-reply-action').length,2);assert.ok(elements(container).some(e=>e.className==='guestbook-reply'));
 const reply=elements(container).find(e=>e.attributes['aria-label']==='답글');reply.events.click();const input=elements(container).find(e=>e.tag==='textarea'),form=elements(container).find(e=>e.tag==='form');input.value='My reply';await form.events.submit({preventDefault(){}});assert.equal(JSON.parse(calls[1].body).parent,root.id);dispose();
});

test('guestbook deletion waits for confirmation; links and minute timestamps preserve plain text without copy buttons',async()=>{
 const source=await readFile(new URL('../src/scripts/village-guestbook.js',import.meta.url),'utf8'),container=new Element('div'),calls=[],messages=[];
 const entry={id:'12345678-1234-1234-1234-123456789012',name:'Visitor',message:'Read https://example.com/art. javascript:alert(1)',created:1,canDelete:true};
 const context={document:{documentElement:{lang:'ko'},createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},AbortController,encodeURIComponent,Date,fetch:async(_url,options)=>{calls.push(options);return Response.json({canWrite:true,entries:[entry],retryAfter:0});}};
 const dispose=vm.runInNewContext(source.replace('export function','function')+';mountGuestbook;',context)(container,'frondward',{notice:{message:text=>messages.push(text),cooldown(){}}});
 await new Promise(resolve=>setImmediate(resolve));
 const time=elements(container).find(e=>e.tag==='time');assert.match(time.textContent,/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/);
 const links=elements(container).filter(e=>e.tag==='a');assert.equal(links.length,1);assert.equal(links[0].href,'https://example.com/art');assert.equal(links[0].rel,'noopener noreferrer nofollow');
 assert.equal(elements(container).some(e=>e.attributes['aria-label']==='본문 복사'),false);
 const remove=elements(container).find(e=>e.attributes['aria-label']==='삭제'),dialog=elements(container).find(e=>e.tag==='dialog');
 let pending=remove.events.click();assert.equal(dialog.open,true);assert.equal(calls.length,1);elements(dialog).find(e=>e.textContent==='취소').events.click();await pending;assert.equal(calls.length,1);
 pending=remove.events.click();elements(dialog).find(e=>e.tag==='button'&&e.textContent==='삭제').events.click();await pending;assert.equal(calls[1].method,'DELETE');dispose();
});

test('scene notice counts down without network calls and clears its timer when the page ends',async()=>{
 const source=await readFile(new URL('../src/scripts/village-notice.mjs',import.meta.url),'utf8'),notice=new Element('p');let now=0,tick,cleared=0;
 const context={Date:{now:()=>now},setTimeout:fn=>{tick=fn;return 1;},clearTimeout:()=>cleared++,getComputedStyle:()=>({top:'24px'})};
 const controller=vm.runInNewContext(source.replace('export function','function')+';createSceneNotice;',context)(notice,true);
 controller.cooldown(3);assert.match(notice.textContent,/3초/);now=1000;tick();assert.match(notice.textContent,/2초/);controller.message('복사했습니다.');assert.match(notice.textContent,/복사했습니다/);now=7000;tick();assert.equal(notice.hidden,true);controller.dispose();assert.ok(cleared>0);
});

test('guestbook contact menus distinguish team from individual and hidden posts have no personal menu',async()=>{
 const source=await readFile(new URL('../src/scripts/village-guestbook.js',import.meta.url),'utf8'),container=new Element('div'),calls=[];
 const entries=[{id:'one',name:'Visitor',message:'Hi',created:1,author_team_name:'Team',team:{id:'frondward',hasHouse:true,contact:{email:'team@example.com',discordUserId:'123456789012345678'}},contact:{email:'person@example.com',discordUserId:'123456789012345679'}},{id:'two',name:'',message:'Hidden',created:2,author_team_name:'Team',contact:null}];
 const context={document:{documentElement:{lang:'ko'},createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},AbortController,encodeURIComponent,Date,fetch:async(url,options)=>{calls.push({url,options});return Response.json({canWrite:true,identity:{name:'Me',teams:[]},entries,next:null});}};
 const dispose=vm.runInNewContext(source.replace('export function','function')+';mountGuestbook;',context)(container,'frondward',{board:'album-feedback'});await new Promise(resolve=>setImmediate(resolve));
 assert.ok(calls[0].url.includes('board=album-feedback'));assert.equal(elements(container).filter(e=>e.className==='guestbook-person').length,1);
 const links=elements(container).filter(e=>e.tag==='a');assert.ok(links.some(a=>a.href==='mailto:team%40example.com'));assert.ok(links.some(a=>a.href==='mailto:person%40example.com'));assert.ok(links.some(a=>a.href==='https://discord.com/users/123456789012345679'));
 const form=elements(container).find(e=>e.tag==='form');elements(form).find(e=>e.type==='email').value='public@example.com';const checks=elements(form).filter(e=>e.type==='checkbox');checks.at(-1).checked=true;elements(form).find(e=>e.tag==='textarea').value='Hello';await form.events.submit({preventDefault(){}});assert.equal(JSON.parse(calls[1].options.body).shareDiscord,true);dispose();
});

test('object palette exposes types only; legacy displays can flip and choose a different registered Work',async()=>{
 const ui=await setup();const press=label=>elements(ui.scene).find(e=>e.attributes['aria-label']===label).events.click();
 press('물건 놓기');assert.ok(elements(ui.scene).some(e=>e.attributes['aria-label']==='물건 종류'));assert.equal(ui.button('GRENCH BOSS'),undefined);press('전시대');
 const event={button:0,pointerId:1,clientX:0,clientY:0,point:{x:0,y:0},target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){}};
 ui.scene.events.pointerdown(event);ui.scene.events.pointerup(event);assert.equal(ui.api.toolLabel,'선택·이동');
 const item=()=>ui.preview().workers.find(w=>w.id==='frondward').room.floors[0].exhibits.at(-1);assert.equal(item().kind,'project');assert.equal(item().width,1);assert.equal(item().depth,1);
 press('좌우 반전');assert.equal(item().flip,true);press('좌우 반전');assert.equal(item().flip,false);
 assert.ok(ui.button('Yggbound'));ui.button('Yggbound').events.click();assert.equal(item().ref,'yggbound');assert.equal(elements(ui.scene).some(e=>e.className==='participant-work-picker'),false);
 const id='frondward:grench-boss',legacyEvent={...event,point:{x:1,y:7},target:{closest:s=>s==='[data-object]'?{dataset:{object:id}}:null}};
 ui.scene.events.pointerdown(legacyEvent);ui.scene.events.pointerup(legacyEvent);press('작품 선택');ui.button('Yggbound').events.click();
 assert.ok(ui.preview().workers.find(w=>w.id==='frondward').room.hiddenItems.includes(id));assert.equal(item().x,1);assert.equal(item().y,7);assert.equal(item().ref,'yggbound');assert.ok(ui.preview().projects.some(p=>p.slug==='grench-boss'));
});

test('height presets cycle low normal high without numeric inputs and tile painting is one undo gesture',async()=>{
 const ui=await setup();const height=()=>elements(ui.api.floorBar).find(e=>e.className==='floor-height');
 assert.equal(height().textContent,'보통');height().events.click();assert.equal(height().textContent,'높음');height().events.click();assert.equal(height().textContent,'낮음');height().events.click();assert.equal(height().textContent,'보통');
 elements(ui.scene).find(e=>e.attributes['aria-label']==='타일 놓기').events.click();assert.equal(elements(ui.scene).filter(e=>e.attributes['aria-label']==='타일 종류').length,1);
 const event=x=>({button:0,pointerId:1,clientX:x*10,clientY:0,point:{x,y:0},target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){}});
 ui.scene.events.pointerdown(event(-1));ui.scene.events.pointermove(event(-2));ui.scene.events.pointerup(event(-2));
 const tiles=()=>ui.preview().workers.find(w=>w.id==='frondward').room.floors[0].tiles;
 assert.ok(tiles().some(t=>t.x===-1&&t.y===0));assert.ok(tiles().some(t=>t.x===-2&&t.y===0));ui.editor.undo();assert.equal(tiles().some(t=>t.x<0),false);
});

test('host scene editor moves a house, rejects collision and groups terrain strokes into one undo, saving only on exit',async()=>{
 const source=(await readFile(new URL('../src/scripts/village-host.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export function','function');
 const scene=new Element('scene');scene.setPointerCapture=()=>{};let rendered=structuredClone(catalog),saved;
 const api={identity:{host:true},catalog,preview:false,scene,signal:new AbortController().signal,canvas:{focus(){}},state:()=>({area:'village',scale:1}),point:e=>e.point,pickVillage:e=>e.id,requestDraw(){},closePopup(){},editorUI(){},applyLayout:layout=>{rendered=mergeVillage(catalog,layout);}};
 const context={api,crypto,document:{createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),addEventListener(){}},window:{addEventListener(){}},AbortSignal,structuredClone,Date,setTimeout,createHistory,historyShortcut,soundtrackChoices,villageSlice,mergeVillage,placementObjects,objectPlacementError,placementCells,paintError,setTerrain,terrainAt,terrainBounds,groundPosition,fetch:async(_url,options)=>{if(options.method==='POST'){saved=JSON.parse(options.body);return Response.json({revision:1});}return Response.json({catalog,payload:villageSlice(catalog),revision:0});}};
 const editor=vm.runInNewContext(source+';createVillageEditor(api);',context);await editor.open();
 const press=label=>elements(scene).find(e=>e.attributes['aria-label']===label).events.click();
 const event=(x,y,id)=>({id,button:0,pointerId:1,clientX:x*10,clientY:y*10,point:{x,y},target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){}});
 const house=catalog.workers.find(w=>w.house),first=event(house.house.x,house.house.y,house.id);
 let point;for(const t of catalog.world.tiles)if(!objectPlacementError(catalog,'house',house.id,t)&&(t.x!==house.house.x||t.y!==house.house.y)){point=t;break;}assert.ok(point);
 scene.events.pointerdown(first);scene.events.pointermove(event(point.x,point.y,house.id));scene.events.pointerup(event(point.x,point.y,house.id));assert.equal(rendered.workers.find(w=>w.id===house.id).house.x,point.x);assert.equal(saved,undefined);editor.undo();assert.deepEqual(rendered.workers.find(w=>w.id===house.id).house,house.house);
 press('마을 타일');scene.events.pointerdown(event(-1,0));scene.events.pointermove(event(-2,0));scene.events.pointerup(event(-2,0));assert.ok(rendered.world.tiles.some(t=>t.x===-2));editor.undo();assert.equal(rendered.world.tiles.some(t=>t.x<0),false);
 for(const [kind,label]of [['tree','나무'],['grass','풀'],['sign','간판'],['project','전시대'],['music','주크박스']]){
  press('물건 놓기');press(label);const type=['project','music'].includes(kind)?'exhibit':kind,point=rendered.world.tiles.find(t=>!objectPlacementError(rendered,type,'',t));assert.ok(point,kind);
  scene.events.pointerdown(event(point.x,point.y));scene.events.pointerup(event(point.x,point.y));
  const items=type==='exhibit'?rendered.world.exhibits:rendered.world.decorations,item=items.at(-1);assert.equal(item.kind||item.type,kind);
  if(type==='exhibit'){const options=elements(scene).filter(e=>e.tag==='button'&&e.textContent&&e.attributes['aria-pressed']!==undefined);assert.ok(options.length);options.at(-1).events.click();}
  assert.ok(elements(scene).some(e=>e.attributes['aria-label']==='삭제'));press('삭제');assert.equal((type==='exhibit'?rendered.world.exhibits:rendered.world.decorations).some(e=>e.id===item.id),false);
 }
 press('마을 타일');scene.events.pointerdown(event(-1,0));scene.events.pointerup(event(-1,0));assert.equal(await editor.close(),true);assert.deepEqual(Object.keys(saved).sort(),['layout','revision']);assert.equal(saved.layout.houses.length,catalog.workers.filter(w=>w.house).length);
});

test('leaving for the village awaits successful editor close and never leaves edit mode enabled on reentry',async()=>{
 const source=await readFile(new URL('../src/scripts/village.js',import.meta.url),'utf8');
 for(const success of [false,true]){
  let handler,closed=0,area='room';const back={addEventListener:(_type,fn)=>handler=fn},context={$:()=>back,participantEditor:{isOpen:true,close:async()=>{closed++;return success;}},tutorialStep:null,tutorial:{complete(){}},changeArea:value=>area=value};
  vm.runInNewContext(source.slice(source.indexOf("$('back').addEventListener('click'"),source.indexOf('function closePopup(')),context);await handler();assert.equal(closed,1);assert.equal(area,success?'village':'room');
 }
 const ui=await setup();await ui.editor.close();ui.api.enter('frondward');ui.editor.areaChanged();assert.equal(ui.editor.isEditing,false);assert.equal(ui.editor.isOpen,false);
 assert.equal(elements(ui.scene).some(e=>e.attributes['aria-label']==='물건 지우기'),false);
});

test('a selected jukebox names its current song directly and its song picker updates the assignment',async()=>{
 const payload=studioSlice(catalog,'frondward');payload.room.floors[0].exhibits.push({id:'song-deck',kind:'music',ref:'legacy',x:0,y:0,width:1,depth:1});
 const ui=await setup(url=>url.includes('/session')?Response.json({owners:['frondward'],host:false}):Response.json({catalog,payload,revision:0}));
 const event={button:0,pointerId:1,clientX:0,clientY:0,point:{x:0,y:0},target:{closest:s=>s==='[data-object]'?{dataset:{object:'display:frondward:0:song-deck'}}:null},preventDefault(){},stopImmediatePropagation(){}};
 ui.scene.events.pointerdown(event);ui.scene.events.pointerup(event);
 let choose=elements(ui.scene).find(e=>e.attributes['aria-label']==='곡 선택');assert.ok(choose);assert.equal(choose.className,'participant-reference');assert.equal(choose.children[1].textContent,catalog.music.title);assert.equal(elements(ui.scene).some(e=>e.attributes['aria-label']==='Work 선택'),false);
 choose.events.click();ui.button('Veiled Garden').events.click();choose=elements(ui.scene).find(e=>e.attributes['aria-label']==='곡 선택');assert.equal(choose.children[1].textContent,'Veiled Garden');assert.equal(ui.preview().workers.find(w=>w.id==='frondward').room.floors[0].exhibits.at(-1).ref,'veiled-garden');
});

test('placement follows a preview until release and cancellation leaves no exhibit behind',async()=>{
 const ui=await setup(undefined,true),press=label=>elements(ui.scene).find(e=>e.attributes['aria-label']===label).events.click();
 press('물건 놓기');press('주크박스');const event=x=>({button:0,pointerId:1,clientX:x*10,clientY:0,point:{x,y:0},target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){}}),items=()=>ui.preview().workers.find(w=>w.id==='frondward').room.floors[0].exhibits;
 const count=items().length;ui.scene.events.pointerdown(event(0));assert.equal(items().length,count);ui.scene.events.pointermove(event(1));ui.editor.draw(0);assert.equal(ui.ghosts.at(-1)[0],'music');assert.equal(ui.ghosts.at(-1)[1].x,1);assert.equal(ui.ghosts.at(-1)[3],true);
 ui.scene.events.pointercancel(event(1));assert.equal(items().length,count);
 ui.scene.events.pointerdown(event(0));ui.scene.events.pointermove(event(1));ui.scene.events.pointerup(event(1));assert.equal(items().length,count+1);assert.equal(items().at(-1).x,1);assert.ok(ui.button('Veiled Garden'));
});
