import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHistory,historyShortcut} from './editor/history.mjs';
import {studioSlice,mergeStudio} from '../src/server/studio-content.mjs';
import {roomCatalog,objectPlacementError,paintError,placementObjects,placementCells} from './editor-placement.mjs';
import {setTerrain,terrainAt,groundPosition,terrainBounds} from '../src/scripts/village-world.mjs';
import {CONTENT_ORIGIN,resolveMedia} from '../src/content-schema.mjs';
const catalog=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8'));
const source=(await readFile(new URL('../src/scripts/village-participant.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export async function','async function');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.events={};this.dataset={};this.attributes={};this.value='';this.hidden=false;this.classList={toggle:(key,value)=>this.attributes[key]=value};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  insertBefore(item,before){this.children.splice(this.children.indexOf(before),0,item);}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(name,fn){this.events[name]=fn;}
  querySelectorAll(){return this.children.flatMap(child=>[child,...(child.querySelectorAll?.()||[])]).filter(child=>['button','input','select','textarea'].includes(child.tag));}
}
const elements=root=>[root,...root.children.flatMap(child=>elements(child))];
async function setup(response){
  const scene=new Element('scene');scene.setPointerCapture=()=>{};const handlers={},writes=[];let preview,area='village',worker=null,level=0;
  const api={point:event=>event.point,scene,canvas:{focus(){}},root:{dataset:{workers:JSON.stringify([{id:'frondward',name:'Frondward'}])}},requestDraw(){},closePopup(){},state:()=>({area,worker,level,scale:1}),apply(data){preview=data;},enter(owner,index=0){area='room';worker=preview.workers.find(w=>w.id===owner);level=index;}};
  const context={roomCatalog,objectPlacementError,paintError,placementObjects,placementCells,setTerrain,terrainAt,groundPosition,terrainBounds,api,createHistory,historyShortcut,studioSlice,mergeStudio,CONTENT_ORIGIN,resolveMedia,structuredClone,crypto,URL,URLSearchParams,location:{search:''},Blob,Response,setTimeout,
    document:{documentElement:new Element('html'),createElement:tag=>new Element(tag)},window:{addEventListener(type,fn){handlers[type]=fn;}},Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}},
    fetch:async(url,options)=>{if(response)return response(url);if(url.includes('/session'))return Response.json({id:'test',name:'Test',owners:['frondward'],host:false});if(options?.method==='POST'){writes.push({url,payload:JSON.parse(options.body)});return Response.json({revision:1});}return Response.json({catalog,payload:studioSlice(catalog,'frondward'),revision:0,baseHash:'base',stale:false});}};
  const editor=await vm.runInNewContext(source+'\ncreateParticipantEditor(api);',context);
  const button=text=>elements(scene).find(el=>el.tag==='button'&&el.textContent===text);
  return{scene,api,editor,writes,handlers,button,preview:()=>preview};
}
test('participant UI adds and edits an owned Work, saves a private payload and restores browsing without exposing village edits',async()=>{
  const ui=await setup();assert.ok(ui.button('Works'),elements(ui.scene).map(el=>el.textContent).filter(Boolean).join(' | '));ui.button('Works').events.click();ui.button('추가').events.click();
  const added=ui.preview().projects.find(p=>p.slug.startsWith('work-'));assert.deepEqual([...added.workerIds],['frondward']);
  const label=elements(ui.scene).find(el=>el.tag==='label'&&el.children[0]?.textContent==='제목 · ko'),input=label.children[1];input.value='';input.events.input();input.value='내 새 작품';input.events.input();
  assert.equal(ui.preview().projects.find(p=>p.slug===added.slug).title.ko,'내 새 작품');
  const external=elements(ui.scene).find(el=>el.tag==='label'&&el.children[0]?.textContent==='외부 작품 링크 · YouTube / SoundCloud / GitHub 파일').children[1];
  external.value='https://youtu.be/dQw4w9WgXcQ';external.events.input();
  assert.equal(ui.preview().projects.find(p=>p.slug===added.slug).externalUrl,external.value);
  assert.deepEqual(ui.preview().world,catalog.world);
  ui.button('작성본 저장').events.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.writes.length,1);assert.equal(ui.writes[0].payload.payload.projects.find(p=>p.slug===added.slug).title.ko,'내 새 작품');assert.ok(!('world' in ui.writes[0].payload.payload));
  ui.button('닫기').events.click();assert.equal(ui.scene.children[0].hidden,true);ui.editor.open();assert.equal(ui.scene.children[0].hidden,false);
});
test('unauthenticated scene shows only login and keeps that action after reopening',async()=>{
  const ui=await setup(()=>Response.json({error:'Discord 로그인이 필요합니다.'},{status:401}));
  const login=()=>elements(ui.scene).find(el=>el.tag==='a'&&el.href==='/api/studio/login');assert.ok(login());
  ui.button('닫기').events.click();ui.editor.open();assert.ok(login());assert.equal(ui.button('작성본 저장'),undefined);
});


test('participant editor expands in place and restores page scrolling on close without discarding the draft',async()=>{
  const ui=await setup();assert.equal(ui.scene.attributes['studio-fullscreen'],true);
  ui.button('닫기').events.click();assert.equal(ui.scene.attributes['studio-fullscreen'],false);
  ui.editor.open();assert.equal(ui.scene.attributes['studio-fullscreen'],true);
  ui.button('꾸미기').events.click();
  assert.ok(elements(ui.scene).some(e=>e.tag==='details'&&e.children[0]?.textContent==='전시할 작품'&&!e.open));
  const add=elements(ui.scene).find(e=>e.attributes['aria-label']==='전시물 놓기');add.events.click();
  const choices=elements(ui.scene).find(e=>e.tag==='details'&&e.children[0]?.textContent==='전시할 작품');assert.equal(choices.open,true);
  const select=elements(choices).find(e=>e.tag==='select');select.value='music:legacy';select.events.change();
  assert.equal(elements(ui.scene).find(e=>e.tag==='details'&&e.children[0]?.textContent==='전시할 작품').open,false);
  assert.equal(ui.writes.length,0);
});


test('first gesture selects an exhibit; only dragging the selected exhibit moves it and undo restores it',async()=>{
  const payload=studioSlice(catalog,'frondward');payload.room.floors[0].exhibits.push({id:'test-display',kind:'music',ref:'legacy',x:0,y:0,width:1,depth:1});
  const ui=await setup(url=>url.includes('/session')?Response.json({owners:['frondward'],host:false}):Response.json({catalog,payload,revision:0,baseHash:'base',stale:false}));
  ui.button('꾸미기').events.click();
  const event=(x,y)=>({button:0,pointerId:1,clientX:x*10,clientY:y*10,point:{x,y},target:{closest:()=>({dataset:{object:'display:frondward:0:test-display'}})},preventDefault(){},stopImmediatePropagation(){}});
  // UI targets are excluded from map gestures; the fixture only matches object selectors.
  const e=(x,y)=>{const value=event(x,y);value.target.closest=selector=>selector==='[data-object]'?{dataset:{object:'display:frondward:0:test-display'}}:null;return value;};
  ui.scene.events.pointerdown(e(0,0));ui.scene.events.pointermove(e(1,0));ui.scene.events.pointerup(e(1,0));
  const position=()=>ui.preview().workers.find(w=>w.id==='frondward').room.floors[0].exhibits[0].x;
  assert.equal(position(),0);
  ui.scene.events.pointerdown(e(0,0));ui.scene.events.pointermove(e(1,0));ui.scene.events.pointerup(e(1,0));assert.equal(position(),1,elements(ui.scene).filter(e=>e.attributes.role==="status").map(e=>e.textContent).join(" | "));
  let blocked=false;ui.scene.events.click({target:{closest:()=>true},stopImmediatePropagation(){blocked=true;}});assert.equal(blocked,false);
  const undo=elements(ui.scene).find(el=>el.attributes['aria-label']==='실행 취소');undo.events.click();assert.equal(position(),0);
  assert.deepEqual(ui.preview().world,catalog.world);
});
