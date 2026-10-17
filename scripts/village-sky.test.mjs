import test from 'node:test';
import assert from 'node:assert/strict';
import {villageSky} from '../src/scripts/village-sky.mjs';
test('local time sky wraps midnight, fades stars and keeps daytime and night UI legible',()=>{
  const sky=(hour,minute=0)=>villageSky(new Date(2026,9,18,hour,minute));
  assert.equal(sky(0).stars,1);assert.equal(sky(12).stars,0);assert.equal(sky(22).stars,1);
  assert.equal(sky(12).ink,'#526347');assert.equal(sky(22).ink,'#eddfc7');
  assert.notEqual(sky(6).background,sky(6,30).background);
  for(let hour=0;hour<24;hour++)assert.ok(sky(hour).stars>=0&&sky(hour).stars<=1);
  assert.equal(sky(23,59).background,sky(0).background);
});
