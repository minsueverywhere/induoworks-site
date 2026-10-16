import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Fake bindings and fetch keep these checks entirely offline; no mail is sent.
const bindings={RESEND_API_KEY:'test-key',CONTACT_FROM_EMAIL:'contact@example.com',CONTACT_TO_EMAIL:'inbox@example.com',TURNSTILE_SECRET_KEY:'test-secret'};
const fakeEnv=values=>'export const env='+JSON.stringify(values)+';env.CONTACT_RATE_LIMITER={limit:async()=>({success:true})};';
const hooks=registerHooks({resolve(specifier,context,next){
  if(specifier==='cloudflare:workers')return {url:'data:text/javascript,'+encodeURIComponent(fakeEnv(bindings)),shortCircuit:true};
  return next(specifier,context);
}});
const {POST}=await import('../src/pages/api/contact.ts');
const {env:testEnv}=await import('cloudflare:workers');
hooks.deregister();
const valid={name:'Test sender',email:'test@example.com',message:'A test message with <markup>.','cf-turnstile-response':'test-token'};
const request=payload=>POST({request:new Request('https://induo.works/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})});

test('invalid payloads fail before calling verification or email',async()=>{
  const fetch=mock.method(globalThis,'fetch',()=>{throw new Error('must not fetch');});
  try {
    for(const payload of [null,[],{...valid,name:{}},{...valid,message:2},{...valid,email:'invalid'},{...valid,message:'short'}]){
      const response=await request(payload);
      assert.equal(response.status,400);assert.equal((await response.json()).code,'validation');
    }
    assert.equal(fetch.mock.callCount(),0);
  } finally {fetch.mock.restore();}
});

test('expired verification and verification outages never send email',async()=>{
  let calls=0;
  const fetch=mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({success:false});});
  const log=mock.method(console,'error',()=>{});
  try {
    let response=await request({...valid,'cf-turnstile-response':''});
    assert.equal(response.status,403);assert.equal(calls,0);
    response=await request(valid);
    assert.equal(response.status,403);assert.equal((await response.json()).code,'verification');assert.equal(calls,1);
    fetch.mock.mockImplementation(async()=>{throw new Error('offline');});
    response=await request(valid);
    assert.equal(response.status,503);assert.equal((await response.json()).code,'unavailable');
  } finally {fetch.mock.restore();log.mock.restore();}
});

test('a missing Turnstile secret fails closed instead of skipping verification',async()=>{
  const {TURNSTILE_SECRET_KEY,...withoutSecret}=bindings;
  const hooks=registerHooks({resolve(specifier,context,next){
    if(specifier==='cloudflare:workers')return {url:'data:text/javascript,'+encodeURIComponent(fakeEnv(withoutSecret)),shortCircuit:true};
    return next(specifier,context);
  }});
  const {POST:unprotected}=await import('../src/pages/api/contact.ts?without-turnstile');
  hooks.deregister();
  const fetch=mock.method(globalThis,'fetch',()=>{throw new Error('must not fetch');});
  const log=mock.method(console,'error',()=>{});
  try {
    const response=await unprotected({request:new Request('https://induo.works/api/contact',{method:'POST',body:JSON.stringify(valid)})});
    assert.equal(response.status,503);assert.equal((await response.json()).code,'unavailable');assert.equal(fetch.mock.callCount(),0);
  } finally {fetch.mock.restore();log.mock.restore();}
});

test('verified messages preserve reply address, sanitize the subject and escape HTML',async()=>{
  let delivery;
  const fetch=mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).includes('siteverify'))return Response.json({success:true});
    assert.equal(url,'https://api.resend.com/emails');
    delivery=JSON.parse(options.body);
    return Response.json({id:'test-delivery'});
  });
  try {
    const response=await request({...valid,name:'Test\r\nSubject\u2028name'});
    assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
    assert.equal(delivery.to,bindings.CONTACT_TO_EMAIL);assert.equal(delivery.reply_to,valid.email);
    assert.equal(delivery.subject,'New contact form message from Test Subject name');
    assert.match(delivery.html,/&lt;markup&gt;/);assert.ok(!delivery.html.includes('<markup>'));
  } finally {fetch.mock.restore();}
});

test('email-provider failures are never reported as success',async()=>{
  const log=mock.method(console,'error',()=>{});
  const fetch=mock.method(globalThis,'fetch',async url=>String(url).includes('siteverify')?Response.json({success:true}):Response.json({name:'validation_error',message:'Test rejection'},{status:403}));
  try {
    let response=await request(valid);
    assert.equal(response.status,502);assert.equal((await response.json()).code,'unavailable');
    fetch.mock.mockImplementation(async url=>{if(String(url).includes('siteverify'))return Response.json({success:true});throw new Error('offline');});
    response=await request(valid);
    assert.equal(response.status,502);assert.equal((await response.json()).code,'unavailable');
  } finally {fetch.mock.restore();log.mock.restore();}
});

test('form waits for verification, preserves failed messages and refreshes single-use tokens',async()=>{
  const source=await readFile(new URL('../src/views/ContactView.astro',import.meta.url),'utf8');
  const script=source.match(/<script is:inline define:vars=\{\{ strings \}\}>([\s\S]*?)<\/script>/)[1];
  const strings=Object.fromEntries(['sending','sentOk','genericError','send','verificationPending','verificationExpired','verificationError','unavailableError','validationError','rateLimitedError'].map(key=>[key,key]));
  let submit,calls=0,resets=0,tokenResets=0,result={code:'unavailable'},statusCode=200;
  const form={dataset:{verification:'required'},values:{...valid},reportValidity:()=>true,addEventListener:(_,fn)=>{submit=fn;},reset:()=>{resets++;form.values={};}};
  const status={textContent:'',dataset:{}},button={disabled:true},verification={};
  const elements={'contact-form':form,'form-status':status,'submit-btn':button,'verification-status':verification};
  const window={turnstile:{reset:()=>tokenResets++}};
  runInNewContext(script,{strings,window,document:{getElementById:id=>elements[id]},FormData:class{entries(){return Object.entries(form.values);}},fetch:async()=>{calls++;return {ok:statusCode<400,status:statusCode,json:async()=>result};}});
  const send=()=>submit({preventDefault(){}});
  await send();assert.equal(calls,0);
  window.contactVerified();assert.equal(button.disabled,false);
  window.contactVerificationExpired();assert.equal(button.disabled,true);assert.equal(verification.textContent,strings.verificationExpired);
  window.contactVerificationFailed();assert.equal(verification.textContent,strings.verificationError);
  window.contactVerified();const pending=send();await send();await pending;
  assert.equal(calls,1);assert.equal(resets,0);assert.equal(form.values.message,valid.message);
  assert.equal(status.dataset.state,'error');assert.equal(status.textContent,strings.unavailableError);
  assert.equal(button.disabled,true);assert.equal(tokenResets,1);
  statusCode=429;result={};window.contactVerified();await send();
  assert.equal(resets,0);assert.equal(form.values.message,valid.message);assert.equal(status.textContent,strings.rateLimitedError);
  statusCode=200;result={ok:true};window.contactVerified();await send();
  assert.equal(calls,3);assert.equal(resets,1);assert.equal(status.textContent,strings.sentOk);
  assert.equal(status.dataset.state,'success');assert.equal(tokenResets,3);assert.equal(button.disabled,true);
});

test('rate limits stop requests before parsing, verification or delivery',async()=>{
  const limiter=mock.method(testEnv.CONTACT_RATE_LIMITER,'limit',async()=>({success:false}));
  const fetch=mock.method(globalThis,'fetch',()=>{throw new Error('must not fetch');});
  const log=mock.method(console,'error',()=>{});
  try {
    const response=await POST({request:new Request('https://induo.works/api/contact',{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.1'},body:'invalid JSON'})});
    assert.equal(response.status,429);assert.equal((await response.json()).code,'rate_limited');
    assert.equal(response.headers.get('Retry-After'),'60');assert.equal(fetch.mock.callCount(),0);
    assert.deepEqual(limiter.mock.calls[0].arguments,[{key:'contact:192.0.2.1'}]);
    limiter.mock.mockImplementation(async()=>{throw new Error('Unavailable');});
    assert.equal((await request(valid)).status,503);assert.equal(fetch.mock.callCount(),0);
  } finally {limiter.mock.restore();fetch.mock.restore();log.mock.restore();}
});
