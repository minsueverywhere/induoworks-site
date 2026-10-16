import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import config from '../astro.config.mjs';

test('production builds refuse a missing public Turnstile key',()=>{
  const hook=config.integrations.find(item=>item.name==='site-build-safety').hooks['astro:config:setup'];
  const previous=process.env.PUBLIC_TURNSTILE_SITE_KEY;
  try {
    process.env.PUBLIC_TURNSTILE_SITE_KEY='';
    assert.throws(()=>hook({command:'build'}),/PUBLIC_TURNSTILE_SITE_KEY/);
    assert.doesNotThrow(()=>hook({command:'dev'}));
    process.env.PUBLIC_TURNSTILE_SITE_KEY='1x00000000000000000000AA';
    assert.doesNotThrow(()=>hook({command:'build'}));
  } finally {
    if(previous===undefined)delete process.env.PUBLIC_TURNSTILE_SITE_KEY;
    else process.env.PUBLIC_TURNSTILE_SITE_KEY=previous;
  }
});

test('theme and icon still update when storage is blocked',async()=>{
  const source=await readFile(new URL('../src/components/ThemeToggle.astro',import.meta.url),'utf8');
  const script=source.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
  let theme='dark',click;
  const hidden={};
  const root={getAttribute:()=>theme,setAttribute:(_,value)=>theme=value};
  const elements={'theme-toggle':{addEventListener:(_,fn)=>click=fn},'icon-sun':{classList:{toggle:(_,value)=>hidden.sun=value}},'icon-moon':{classList:{toggle:(_,value)=>hidden.moon=value}}};
  runInNewContext(script,{document:{documentElement:root,getElementById:id=>elements[id]},localStorage:{setItem(){throw new Error('Storage blocked');}}});
  assert.doesNotThrow(()=>click());assert.equal(theme,'light');assert.equal(hidden.sun,false);assert.equal(hidden.moon,true);
  click();assert.equal(theme,'dark');assert.equal(hidden.sun,true);assert.equal(hidden.moon,false);
});
