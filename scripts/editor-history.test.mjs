import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHistory, historyShortcut } from './editor/history.mjs';

test('one painting gesture is one undo step, including cancellation and no-op strokes',()=>{
  const h=createHistory(),draft={tiles:['grass','grass','grass'],house:{x:3,y:3}};
  h.reset(draft);h.begin();
  for(let i=0;i<3;i++){draft.tiles[i]='path';h.record(draft);}
  assert.equal(h.canUndo(draft),true);h.end(draft);
  const undone=h.undo(draft);assert.deepEqual(undone.tiles,['grass','grass','grass']);
  const redone=h.redo(undone);
  assert.deepEqual(redone,draft);
  h.begin();h.end(draft);assert.deepEqual(h.undo(draft).tiles,['grass','grass','grass']);
  assert.equal(h.undo({tiles:['grass','grass','grass'],house:{x:3,y:3}}),null);
});

test('history isolates snapshots, discards a redo branch, and limits memory',()=>{
  const h=createHistory(2);let d={items:[]};h.reset(d);
  for(let i=0;i<3;i++){d.items.push({id:i});h.record(d);}
  d=h.undo(d);assert.equal(d.items.length,2);d.items[0].id=99;h.record(d);
  assert.equal(h.canRedo,false);d=h.undo(d);assert.equal(d.items[0].id,0);
  d=h.undo(d);assert.equal(d.items.length,1);assert.equal(h.undo(d),null);
  h.reset(d);assert.equal(h.canUndo(d),false);assert.equal(h.canRedo,false);
});

test('shortcuts use Ctrl or Cmd, preserve native field editing and ignore other chords',()=>{
  const event={key:'z',ctrlKey:true,target:{closest:()=>null}};
  assert.equal(historyShortcut(event),'undo');assert.equal(historyShortcut({...event,shiftKey:true}),'redo');
  assert.equal(historyShortcut({...event,ctrlKey:false,metaKey:true}),'undo');
  for(const changed of [{altKey:true},{ctrlKey:false},{key:'a'},{target:{closest:()=>({})}}])assert.equal(historyShortcut({...event,...changed}),null);
});

test('editor theme shares the site setting, follows changes and tolerates blocked storage',async()=>{
  const code=await readFile(new URL('./editor/theme.js',import.meta.url),'utf8');
  let theme='dark';const events={},root={dataset:{}},context={document:{documentElement:root},localStorage:{getItem(){if(theme==='blocked')throw Error();return theme;}},Event:class{},window:{dispatchEvent(){},addEventListener(name,fn){events[name]=fn;}}};
  vm.runInNewContext(code,context);assert.equal(root.dataset.theme,'dark');theme='light';events.storage({key:'theme'});assert.equal(root.dataset.theme,'light');
  theme='blocked';events.storage({key:null});assert.equal(root.dataset.theme,'light');
});

test('actual map handlers bracket multiple painted tiles once on release or cancel',async()=>{
  const source=(await readFile(new URL('./editor/bridge.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
  const handlers={},messages=[],world={tiles:Array.from({length:576},()=>({type:'grass'})),decorations:[]};
  const window={postMessage(message){messages.push(message);},addEventListener(type,fn){handlers['window:'+type]=fn;}};
  const context={window,parent:window,document:{documentElement:{dataset:{}}},location:{origin:'http://localhost:4323'},root:{dataset:{}},remoteContent:{},sceneWorld:world,objects:[],area:'village',width:0,height:0,scale:1,camera:{x:0,y:0},canvas:{focus(){}},requestDraw(){},makeGround(){},paintError(){return '';},toScreen(){return{x:0,y:0};},scene:{getBoundingClientRect(){return{left:0,top:0};},setPointerCapture(){},addEventListener(type,fn){handlers[type]=fn;}}};
  vm.runInNewContext(source,context);
  handlers['window:message']({origin:context.location.origin,source:window,data:{source:'induo-editor',tool:'path'}});
  const event=(x,y)=>({clientX:(x-y)*24,clientY:(x+y)*12+30,pointerId:1,button:0,target:{closest(){return null;}},stopImmediatePropagation(){},preventDefault(){}});
  for(const ending of ['pointerup','pointercancel']){
    world.tiles.forEach(tile=>tile.type='grass');messages.length=0;
    handlers.pointerdown(event(1,1));handlers.pointermove(event(2,1));handlers.pointermove(event(3,1));handlers[ending](event(3,1));handlers.lostpointercapture(event(3,1));
    assert.deepEqual(messages.map(m=>m.type),['begin','tile','tile','tile','end']);
    const draft={tiles:Array(3).fill('grass')},h=createHistory();h.reset(draft);
    for(const m of messages){if(m.type==='begin')h.begin();if(m.type==='tile'){draft.tiles[m.x-1]=m.terrain;h.record(draft);}if(m.type==='end')h.end(draft);}
    const undone=h.undo(draft);assert.deepEqual(undone.tiles,Array(3).fill('grass'));assert.equal(h.canUndo(undone),false);
  }
});
