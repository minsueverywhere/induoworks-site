import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const hooks=registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={};',shortCircuit:true};return next(specifier,context);}});
const {ALL}=await import('../src/pages/api/studio/[action].ts');hooks.deregister();
test('failed OAuth returns to a retry screen without putting secrets or provider errors in the URL',async()=>{
  const response=await ALL({request:new Request('https://induo.works/api/studio/callback?code=never-echo-this'),params:{action:'callback'}});
  assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'https://induo.works/ko/?studio=1&authError=1');assert.equal(response.headers.get('Cache-Control'),'no-store');
  const missing=await ALL({request:new Request('https://induo.works/api/studio/session'),params:{action:'session'}});assert.equal(missing.status,503);
});
