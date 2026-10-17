import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHistory,historyShortcut} from './editor/history.mjs';
import {studioSlice,mergeStudio} from '../src/server/studio-content.mjs';
import {CONTENT_ORIGIN,resolveMedia} from '../src/content-schema.mjs';
const catalog=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8'));
const source=(await readFile(new URL('../src/scripts/village-participant.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export async function','async function');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.events={};this.dataset={};this.attributes={};this.value='';this.hidden=false;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  insertBefore(item,before){this.children.splice(this.children.indexOf(before),0,item);}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(name,fn){this.events[name]=fn;}
  querySelectorAll(){return this.children.flatMap(child=>[child,...(child.querySelectorAll?.()||[])]).filter(child=>['button','input','select','textarea'].includes(child.tag));}
}
const elements=root=>[root,...root.children.flatMap(child=>elements(child))];
async function setup(response){
  const scene=new Element('scene'),handlers={},writes=[];let preview,area='village',worker=null,level=0;
  const api={scene,canvas:{},root:{dataset:{workers:JSON.stringify([{id:'frondward',name:'Frondward'}])}},requestDraw(){},closePopup(){},state:()=>({area,worker,level,scale:1}),apply(data){preview=data;},enter(owner,index=0){area='room';worker=preview.workers.find(w=>w.id===owner);level=index;}};
  const context={api,createHistory,historyShortcut,studioSlice,mergeStudio,CONTENT_ORIGIN,resolveMedia,structuredClone,crypto,URL,URLSearchParams,location:{search:''},Blob,Response,setTimeout,
    document:{createElement:tag=>new Element(tag)},window:{addEventListener(type,fn){handlers[type]=fn;}},Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}},
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
