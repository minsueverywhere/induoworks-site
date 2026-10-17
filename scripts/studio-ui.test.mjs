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
  getAttribute(key){return this.attributes[key];}
  addEventListener(name,fn){this.events[name]=fn;}
  querySelectorAll(){return this.children.flatMap(child=>[child,...(child.querySelectorAll?.()||[])]).filter(child=>['button','input','select','textarea'].includes(child.tag));}
}
const elements=root=>[root,...root.children.flatMap(child=>elements(child))];
async function setup(response,previewMode=false){
  const scene=new Element('scene');scene.setPointerCapture=()=>{};const handlers={},writes=[];let preview,area='village',worker=null,level=0;
  const api={preview:previewMode,catalog,point:event=>event.point,scene,canvas:{focus(){}},root:{dataset:{workers:JSON.stringify([{id:'frondward',name:'Frondward'}])}},requestDraw(){},closePopup(){},state:()=>({area,worker,level,scale:1}),apply(data){preview=data;},enter(owner,index=0){area='room';worker=preview.workers.find(w=>w.id===owner);level=index;}};
  const context={roomCatalog,objectPlacementError,paintError,placementObjects,placementCells,setTerrain,terrainAt,groundPosition,terrainBounds,api,createHistory,historyShortcut,studioSlice,mergeStudio,CONTENT_ORIGIN,resolveMedia,structuredClone,crypto,URL,URLSearchParams,location:{search:''},Blob,Response,setTimeout,
    document:{addEventListener(){},documentElement:new Element('html'),createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},window:{addEventListener(type,fn){handlers[type]=fn;}},Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}},
    fetch:async(url,options)=>{if(response&&options?.method!=='POST')return response(url);if(url.includes('/session'))return Response.json({id:'test',name:'Test',owners:['frondward'],host:false});if(options?.method==='POST'){writes.push({url,payload:JSON.parse(options.body)});return Response.json({revision:1});}return Response.json({catalog,payload:studioSlice(catalog,'frondward'),revision:0,baseHash:'base',stale:false});}};
  const editor=await vm.runInNewContext(source+'\ncreateParticipantEditor(api);',context);
  const button=text=>elements(scene).find(el=>el.tag==='button'&&el.textContent===text);
  return{scene,api,editor,writes,handlers,button,preview:()=>preview};
}
test('scene editor only places registered own works, preserves catalog data and publishes only room layout',async()=>{
  const payload=studioSlice(catalog,'frondward'),privateWork={...payload.projects[0],slug:'private-only',title:{ko:'비공개 새작품',en:'Private'}};payload.projects.push(privateWork);
  const ui=await setup(url=>url.includes('/session')?Response.json({owners:['frondward'],host:false}):Response.json({catalog,payload,revision:0,baseHash:'base',stale:false}));
  assert.equal(ui.button('Works'),undefined);assert.equal(ui.button('이미지'),undefined);assert.equal(ui.button('음악'),undefined);assert.equal(ui.button('꾸미기'),undefined);assert.equal(ui.button('비공개 새작품'),undefined);
  assert.ok(ui.button('GRENCH BOSS'));assert.equal(ui.button('Induo Works 웹사이트'),undefined);
  ui.button('배치 공개').events.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.writes.length,1);assert.deepEqual(Object.keys(ui.writes[0].payload).sort(),['revision','room']);assert.equal(ui.writes[0].payload.room.floors.length,payload.room.floors.length);
  assert.deepEqual(ui.preview().world,catalog.world);ui.editor.close();assert.equal(ui.scene.children[0].hidden,true);ui.editor.open();assert.equal(ui.scene.children[0].hidden,false);
});

test('unauthenticated scene stays closed and never exposes the editing tools',async()=>{
  const ui=await setup(()=>Response.json({error:'Discord 로그인이 필요합니다.'},{status:401}));
  assert.equal(ui.scene.children[0].hidden,true);assert.equal(ui.button('배치 공개'),undefined);
});

test('participant settings preserve independent full-screen state and collapse the picker after selection',async()=>{
  const ui=await setup();assert.equal(ui.scene.attributes['studio-fullscreen'],undefined);
  ui.editor.close();assert.equal(ui.scene.attributes['studio-fullscreen'],undefined);
  ui.editor.open();assert.equal(ui.scene.attributes['studio-fullscreen'],undefined);
  assert.ok(elements(ui.scene).some(e=>e.tag==='details'&&e.children[0]?.textContent==='내 작품'&&!e.open));
  const add=elements(ui.scene).find(e=>e.attributes['aria-label']==='작품 놓기');add.events.click();
  const choices=elements(ui.scene).find(e=>e.tag==='details'&&e.children[0]?.textContent==='내 작품');assert.equal(choices.open,true);
  ui.button(catalog.music.title).events.click();
  assert.equal(elements(ui.scene).find(e=>e.tag==='details'&&e.children[0]?.textContent==='내 작품').open,false);
  assert.equal(ui.writes.length,0);
});


test('first gesture selects an exhibit; only dragging the selected exhibit moves it and undo restores it',async()=>{
  const payload=studioSlice(catalog,'frondward');payload.room.floors[0].exhibits.push({id:'test-display',kind:'music',ref:'legacy',x:0,y:0,width:1,depth:1});
  const ui=await setup(url=>url.includes('/session')?Response.json({owners:['frondward'],host:false}):Response.json({catalog,payload,revision:0,baseHash:'base',stale:false}));
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


test('home shortcut opens the owned room and hides settings without saving or changing full screen',async()=>{
  const ui=await setup();ui.editor.home();assert.equal(ui.scene.children[0].hidden,true);assert.equal(ui.api.state().worker.id,'frondward');assert.equal(ui.writes.length,0);assert.equal(ui.scene.attributes['studio-fullscreen'],undefined);
});

test('independent scene view toggles full screen and restores pre-existing inert values',async()=>{
  const scene=new Element('scene'),button=new Element('button'),sibling={inert:true};
  scene.parentElement={children:[scene,sibling]};scene.parentElement.parentElement=null;
  const root=new Element('html'),code=(await readFile(new URL('../src/scripts/village-view.mjs',import.meta.url),'utf8')).replace('export function','function');
  const view=vm.runInNewContext(code+';createSceneView(scene,button)',{scene,button,document:{addEventListener(){},documentElement:root}});
  view.toggle();assert.equal(scene.attributes['studio-fullscreen'],true);assert.equal(button.attributes['aria-pressed'],'true');assert.equal(sibling.inert,true);
  view.close();view.close();assert.equal(scene.attributes['studio-fullscreen'],false);assert.equal(sibling.inert,true);assert.equal(root.attributes['studio-open'],false);
});


test('LAN scene preview uses only public content and offers no real draft write or submit action',async()=>{
  const ui=await setup(()=>{throw Error('Preview must not call studio APIs');},true);
  assert.ok(ui.button('GRENCH BOSS'));assert.equal(ui.button('배치 공개'),undefined);assert.equal(ui.button('검토 요청'),undefined);assert.equal(ui.writes.length,0);
  ui.handlers.beforeunload({preventDefault(){throw Error('Disposable preview should not block refresh');}});
});
