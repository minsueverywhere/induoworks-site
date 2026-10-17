import test from 'node:test';
import assert from 'node:assert/strict';
import {bindZoomSlider} from '../src/scripts/zoom-slider.mjs';
test('touch slider captures drags, maps the whole track, clamps edges and preserves keyboard input',()=>{
 const handlers={},changes=[],active=[];
 const input={min:'25',max:'160',value:'100',addEventListener:(name,fn)=>handlers[name]=fn,getBoundingClientRect:()=>({left:10,width:96}),setPointerCapture:id=>assert.equal(id,7)};
 bindZoomSlider(input,(value,pointer)=>changes.push([value,pointer]),value=>active.push(value));
 const event=x=>({pointerId:7,button:0,clientX:x,preventDefault(){},stopPropagation(){}});
 handlers.pointerdown(event(58));assert.equal(changes[0][0],92.5);handlers.pointermove(event(-10));assert.equal(changes.at(-1)[0],25);handlers.pointermove(event(200));assert.equal(changes.at(-1)[0],160);
 handlers.pointercancel(event(200));assert.deepEqual(active,[true,false]);const count=changes.length;handlers.pointermove(event(50));assert.equal(changes.length,count);
 handlers.input();assert.deepEqual(changes.at(-1),[100,false]);
});
