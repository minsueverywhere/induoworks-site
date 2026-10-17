import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('page revisits create one instance and release old handlers, observers and subscribers',async()=>{
  const source=(await readFile(new URL('../src/scripts/page-lifecycle.mjs',import.meta.url),'utf8')).replace('export function','function');
  const events=new EventTarget(),target=new EventTarget();let root={isConnected:true},starts=0,clicks=0,cleaned=0,disconnected=0;
  const doc={getElementById:()=>root,addEventListener:events.addEventListener.bind(events)};
  const onPage=vm.runInNewContext(source+';onPage',{document:doc,AbortController,ResizeObserver:class{observe(){}disconnect(){disconnected++;}},console});
  onPage('page',(_,life)=>{starts++;life.on(target,'click',()=>clicks++);life.observe(root,()=>{});life.cleanup(()=>cleaned++);});
  events.dispatchEvent(new Event('astro:page-load'));assert.equal(starts,1);target.dispatchEvent(new Event('click'));assert.equal(clicks,1);
  root.isConnected=false;events.dispatchEvent(new Event('astro:before-swap'));target.dispatchEvent(new Event('click'));assert.equal(clicks,1);assert.equal(cleaned,1);assert.equal(disconnected,1);
  root={isConnected:true};events.dispatchEvent(new Event('astro:page-load'));target.dispatchEvent(new Event('click'));assert.equal(starts,2);assert.equal(clicks,2);
});
