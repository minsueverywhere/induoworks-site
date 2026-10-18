import test from 'node:test';
import assert from 'node:assert/strict';
import { createTutorial, tutorialSteps, contextTutorialSteps } from '../src/scripts/village-tutorial.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { pinchPoints, zoomCamera, panCamera, isDrag } from '../src/scripts/village-camera.mjs';

test('jukebox clicks toggle playback while popup dismissal leaves playback alone',()=>{
  const source=readFileSync(new URL('../src/scripts/village.js',import.meta.url),'utf8');
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,replaceChildren(){},setAttribute(){}});return nodes.get(id);};
  let playing=false,toggles=0;
  const track={title:'Sunlit Circuit'},jukebox={id:'lp',shape:'jukebox',music:track},sign={id:'sign',shape:'sign'};
  const popup={hidden:true,dataset:{},focus(){}},context={
    places:[jukebox,sign],tutorialStep:null,popup,popupObject:null,clearExternal:null,
    buttons:new Map(),$:node,root:{dataset:{music:JSON.stringify(track)}},text:{music:track.title},
    selectMusic(){},music:{toggle(){playing=!playing;toggles++;}},positionPopup(){},matchMedia:()=>({matches:false})
  };
  runInNewContext(source.slice(source.indexOf('function closePopup('),source.indexOf("$('close').addEventListener")),context);
  context.visit('lp');assert.equal(playing,true);assert.equal(popup.hidden,false);
  context.visit('lp');assert.equal(playing,false);assert.equal(popup.hidden,false);
  context.visit('lp');assert.equal(playing,true);assert.equal(popup.hidden,false);
  context.closePopup();assert.equal(playing,true);assert.equal(popup.hidden,true);assert.equal(toggles,3);
  context.visit('lp');assert.equal(playing,false);assert.equal(popup.hidden,false);
  context.visit('sign');context.visit('sign');assert.equal(popup.hidden,true);assert.equal(toggles,4);
});

test('tutorial restarts with the current place and only offers owned-room editing',()=>{
  assert.deepEqual(contextTutorialSteps('village',false,{music:true}),['drag','zoom','music']);
  assert.deepEqual(contextTutorialSteps('room',true,{exhibit:true}),['drag','zoom','edit','exit']);
  assert.deepEqual(contextTutorialSteps('room',false,{exhibit:true}),['drag','zoom','work','exit']);
  assert.deepEqual(contextTutorialSteps('room',false),['drag','zoom','exit']);
  let shown;const tutorial=createTutorial(step=>shown=step);
  tutorial.start(['drag','zoom','work','exit']);
  for(const step of ['drag','zoom','work'])tutorial.complete(step);
  assert.equal(shown,'exit');
  tutorial.close();tutorial.start(['drag','zoom','edit','exit']);
  tutorial.complete('drag');tutorial.complete('zoom');tutorial.complete('work');
  assert.equal(shown,'edit');tutorial.complete('edit');assert.equal(shown,'exit');
});

test('tutorial advances only for the current task and can be skipped or replayed at every step', () => {
  let shown;
  const tutorial = createTutorial(step => { shown = step; });
  tutorial.complete('drag');
  assert.equal(shown, undefined);
  tutorial.start();
  assert.equal(shown, 'drag');
  assert.deepEqual(tutorialSteps, ['drag','zoom','house','music','exit']);
  tutorial.complete('zoom');
  tutorial.complete('house');
  assert.equal(shown, 'drag');
  for (const [i, action] of tutorialSteps.entries()) {
    tutorial.complete(action);
    assert.equal(shown, tutorialSteps[i+1] || 'done');
  }
  tutorial.complete('exit');
  assert.equal(shown, 'done');
  for (let count = 0; count <= tutorialSteps.length; count++) {
    tutorial.start();
    for (const action of tutorialSteps.slice(0,count)) tutorial.complete(action);
    tutorial.close();
    assert.equal(shown, null);
    tutorial.complete('zoom');
    assert.equal(shown, null);
  }
  tutorial.start();
  assert.equal(shown, 'drag');
});

test('real touch handlers recognize pinch zoom without counting it as a drag', () => {
  const source = readFileSync(new URL('../src/scripts/village.js', import.meta.url), 'utf8');
  const handlers = new Map(), completed = [];
  const scene = {
    addEventListener: (name, fn) => handlers.set(name, fn),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture() {}, classList: { add() {}, remove() {} },
  };
  runInNewContext(source.slice(source.indexOf('const pointers = new Map()'), source.indexOf("canvas.addEventListener('keydown'")), {
    life:{on:(target,...args)=>target.addEventListener(...args)},scene, window: { addEventListener() {} }, width: 390, height: 500,
    scale: 1, camera: { x: 0, y: 240 }, hovered: '',
    pinchPoints, zoomCamera, panCamera, isDrag, worldSize: () => 24,
    closePopup() {}, requestDraw() {}, tutorial: { complete: action => completed.push(action) },
  });
  const event = (id, x, y, type) => ({ pointerId: id, clientX: x, clientY: y, type,
    pointerType: 'touch', button: 0, target: { closest: () => null } });
  handlers.get('pointerdown')(event(1,100,200,'pointerdown'));
  handlers.get('pointerdown')(event(2,200,200,'pointerdown'));
  handlers.get('pointermove')(event(2,202,200,'pointermove'));
  assert.deepEqual(completed, []);
  handlers.get('pointermove')(event(2,240,200,'pointermove'));
  assert.deepEqual(completed, ['zoom']);
  handlers.get('pointerup')(event(2,240,200,'pointerup'));
  handlers.get('pointerup')(event(1,100,200,'pointerup'));
  assert.deepEqual(completed, ['zoom']);
  handlers.get('pointerdown')(event(3,100,200,'pointerdown'));
  handlers.get('pointermove')(event(3,140,200,'pointermove'));
  handlers.get('pointerup')(event(3,140,200,'pointerup'));
  assert.deepEqual(completed, ['zoom','drag']);
});

test('tutorial house step only enters the highlighted village hub', () => {
  const source=readFileSync(new URL('../src/scripts/village.js',import.meta.url),'utf8');
  const visitSource=source.slice(source.indexOf('function visit('),source.indexOf("$('close').addEventListener"));
  const actions=[], hub={id:'induo-works',shape:'house'},studio={id:'frondward',shape:'house'};
  const context={places:[hub,studio],workers:[hub,studio],tutorialHouse:hub,tutorialStep:'house',
    refreshPublicRoom:async()=>{},changeArea:area=>actions.push(area),tutorial:{complete:step=>actions.push(step)}};
  runInNewContext(visitSource+"\nvisit('frondward');",context);
  assert.deepEqual(actions,[]);
  runInNewContext(visitSource+"\nvisit('induo-works');",context);
  assert.deepEqual(actions,['room','house']);
  context.tutorialStep='drag';actions.length=0;
  runInNewContext(visitSource+"\nvisit('induo-works');",context);
  assert.deepEqual(actions,[]);
});
