import test from 'node:test';
import assert from 'node:assert/strict';
import { popupPosition } from '../src/scripts/village-popup.mjs';

test('object popups follow their anchor and stay inside small and large scenes', () => {
  const popup={width:200,height:150}, scene={width:800,height:600};
  const first=popupPosition({x:300,y:300,width:60,height:70},popup,scene);
  assert.equal(first.side,'above');
  assert.equal(first.x,230);assert.equal(first.y,136);
  const top=popupPosition({x:300,y:10,width:60,height:70},popup,scene);
  assert.equal(top.side,'below');assert.equal(top.y,94);
  const mobile=popupPosition({x:125,y:215,width:44,height:44},{width:246,height:137},{width:272,height:400,top:64});
  assert.ok(mobile.y>=64,'keep the workshop return button clear');
  assert.ok(mobile.y+137<215,'keep the selected object available for a second click');
  for(const scene of [{width:272,height:400},{width:720,height:480}]) {
    const popup={width:Math.min(310,scene.width-24),height:280};
    for(const x of [-200,0,scene.width/2,scene.width+200])for(const y of [-100,0,scene.height/2,scene.height+100]) {
      const p=popupPosition({x,y,width:80,height:96},popup,scene);
      assert.ok(p.x>=12&&p.y>=12);
      assert.ok(p.x+popup.width<=scene.width-12&&p.y+popup.height<=scene.height-12);
    }
  }
});
