import test from 'node:test';
import assert from 'node:assert/strict';
import {musicPosition,musicDock} from '../src/scripts/music-position.mjs';
test('floating music fits small screens and edge docking leaves exactly one handle visible',()=>{
  const viewport={width:360,height:640},size={width:340,height:112};
  assert.deepEqual(musicPosition({x:900,y:900},size,viewport),{x:10,y:518});
  assert.deepEqual(musicPosition({x:-900,y:-900},size,viewport),{x:10,y:10});
  assert.equal(musicPosition({x:0,y:100},size,viewport,'left').x+size.width,32);
  assert.equal(viewport.width-musicPosition({x:0,y:100},size,viewport,'right').x,32);
  assert.equal(musicDock({x:5},size,360),'left');
  assert.equal(musicDock({x:25},{width:176},360),'');
  assert.equal(musicDock({x:200},{width:176},360),'right');
});
