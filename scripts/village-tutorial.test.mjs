import test from 'node:test';
import assert from 'node:assert/strict';
import { createTutorial } from '../src/scripts/village-tutorial.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { pinchPoints, zoomCamera, panCamera, isDrag } from '../src/scripts/village-camera.mjs';

test('tutorial advances only for the current task and can be skipped or replayed at every step', () => {
  let shown;
  const tutorial = createTutorial(step => { shown = step; });
  tutorial.complete('drag');
  assert.equal(shown, undefined);
  tutorial.start();
  assert.equal(shown, 'drag');
  tutorial.complete('zoom');
  tutorial.complete('house');
  assert.equal(shown, 'drag');
  for (const [action, next] of [['drag','house'], ['house','zoom'], ['zoom','done']]) {
    tutorial.complete(action);
    assert.equal(shown, next);
  }
  tutorial.complete('zoom');
  assert.equal(shown, 'done');
  for (let count = 0; count <= 3; count++) {
    tutorial.start();
    for (const action of ['drag','house','zoom'].slice(0,count)) tutorial.complete(action);
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
    scene, window: { addEventListener() {} }, width: 390, height: 500,
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
