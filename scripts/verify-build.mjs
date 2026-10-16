import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const root=new URL('../dist/client/',import.meta.url);
const headers=await readFile(new URL('_headers',root),'utf8');
let scripts=0;
for(const file of await readdir(root,{recursive:true})){
  if(!file.endsWith('.html'))continue;
  const html=await readFile(new URL(file.replaceAll('\\','/'),root),'utf8');
  for(const [,body] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)){
    if(!body.trim())continue;
    const hash=createHash('sha256').update(body).digest('base64');
    assert.ok(headers.includes(`'sha256-${hash}'`),`Missing CSP hash in ${file}`);
    scripts++;
  }
}
assert.ok(scripts>0,'No inline scripts checked');
const scriptPolicy=headers.match(/script-src ([^;]+)/)?.[1];
assert.ok(scriptPolicy&&!scriptPolicy.includes("'unsafe-inline'"),'Inline scripts must use hashes');
assert.match(headers,/\/_astro\/\*/);
const config=JSON.parse(await readFile(new URL('../dist/server/wrangler.json',import.meta.url),'utf8'));
assert.ok(!config.images,'Production must not provision runtime image transformations');
assert.deepEqual(config.ratelimits?.find(item=>item.name==='CONTACT_RATE_LIMITER')?.simple,{limit:5,period:60},'Contact rate-limit binding must survive the adapter build');
for(const path of ['contact/index.html','ko/contact/index.html']){
  assert.match(await readFile(new URL(path,root),'utf8'),/data-verification="required"/,'Contact must include Turnstile');
}
console.log(`Build verified: ${scripts} inline scripts, CSP hashes, Turnstile and static image configuration.`);
