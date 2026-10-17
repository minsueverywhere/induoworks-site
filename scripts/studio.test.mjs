import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {discordLogin,discordCallback,session,authorize,sameOrigin,logout,hash} from '../src/server/studio-auth.ts';
import {studioSlice,mergeStudio} from '../src/server/studio-content.mjs';
import {studioDrafts} from '../src/server/studio-drafts.ts';
const schema=await readFile(new URL('../migrations/0001_studio.sql',import.meta.url),'utf8')+await readFile(new URL('../migrations/0002_studio_hosts.sql',import.meta.url),'utf8');
const catalog=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8'));
function database(){
  const sql=new DatabaseSync(':memory:');sql.exec(schema);
  const wrap=statement=>({bind(...values){const s=sql.prepare(statement);return{first:async()=>s.get(...values)||null,all:async()=>({results:s.all(...values)}),run:async()=>s.run(...values)};}});
  return{sql,env:{STUDIO_DB:{prepare:wrap,batch:async items=>{for(const item of items)await item.run();}},STUDIO_RATE_LIMITER:{limit:async()=>({success:true})},DISCORD_CLIENT_ID:'test-id',DISCORD_CLIENT_SECRET:'test-secret'}};
}
test('Discord state is browser-bound and single-use; sessions contain no provider token and permissions come from the database',async()=>{
  const {sql,env}=database();const start=await discordLogin(new Request('https://induo.works/api/studio/login'),env),url=new URL(start.headers.get('Location'));
  assert.equal(url.searchParams.get('scope'),'identify');const state=url.searchParams.get('state');
  const callback=(cookie=state)=>new Request('https://induo.works/api/studio/callback?code=test&state='+state,{headers:{Cookie:'__Host-induo-oauth='+cookie}});
  let calls=0;const fetcher=async()=>Response.json(++calls===1?{access_token:'provider-secret',scope:'identify'}:{id:'123456789012345678',username:'Test'});
  await assert.rejects(discordCallback(callback('wrong'),env,fetcher),/확인 정보/);assert.equal(calls,0);
  const response=await discordCallback(callback(),env,fetcher),cookies=response.headers.getSetCookie();assert.ok(cookies.every(c=>c.includes('Secure; HttpOnly; SameSite=Lax')));
  const cookie=cookies.find(c=>c.startsWith('__Host-induo-session=')).split(';')[0];assert.ok(!cookie.includes('provider-secret'));
  await assert.rejects(discordCallback(callback(),env,fetcher),/만료/);assert.equal(calls,2);
  const request=new Request('https://induo.works/api/studio/session',{headers:{Cookie:cookie}});
  assert.deepEqual((await session(request,env)).owners,[]);await assert.rejects(authorize(request,env,'frondward'),error=>error.status===403);
  sql.prepare('INSERT INTO studio_members(user_id,worker_id) VALUES(?,?)').run('123456789012345678','frondward');
  assert.deepEqual((await authorize(request,env,'frondward')).owners,['frondward']);
  sql.prepare('DELETE FROM studio_members').run();await assert.rejects(authorize(request,env,'frondward'),error=>error.status===403);
  const logoff=new Request('https://induo.works/api/studio/logout',{method:'POST',headers:{Cookie:cookie,Origin:'https://induo.works','Content-Type':'application/json'},body:'{}'});
  await logout(logoff,env);await assert.rejects(session(request,env),error=>error.status===401);sql.close();
});
test('studio authentication fails closed for missing configuration, cross-origin writes, expired sessions and request floods',async()=>{
  const {sql,env}=database();await assert.rejects(discordLogin(new Request('https://induo.works'),{}),error=>error.status===503);
  await assert.rejects(discordLogin(new Request('https://induo.works'),{...env,STUDIO_RATE_LIMITER:{limit:async()=>({success:false})}}),error=>error.status===429);
  assert.throws(()=>sameOrigin(new Request('https://induo.works',{headers:{Origin:'https://evil.example','Content-Type':'application/json'}})),error=>error.status===403);
  const token='a'.repeat(72);sql.prepare('INSERT INTO studio_sessions VALUES(?,?,?,?)').run(await hash(token),'123','Test',0);
  await assert.rejects(session(new Request('https://induo.works',{headers:{Cookie:'__Host-induo-session='+token}}),env),error=>error.status===401);sql.close();
});
test('participant data can add owned Works and interiors but never village, foreign ownership or conflicting IDs',()=>{
  const before=JSON.stringify(catalog),payload=structuredClone(studioSlice(catalog,'frondward'));
  const project=structuredClone(payload.projects[0]);project.slug='participant-new-work';payload.projects.push(project);
  const next=mergeStudio(catalog,'frondward',payload);assert.ok(next.projects.some(p=>p.slug===project.slug));assert.deepEqual(next.world,catalog.world);assert.deepEqual(next.workers.map(w=>w.house),catalog.workers.map(w=>w.house));
  assert.throws(()=>mergeStudio(catalog,'frondward',{...payload,world:{}}),/집 내부/);
  project.workerIds=['induo-works'];assert.throws(()=>mergeStudio(catalog,'frondward',payload),/다른 제작자/);
  project.workerIds=['frondward'];project.slug='induoworks-site';assert.throws(()=>mergeStudio(catalog,'frondward',payload),/다른 제작자/);
  project.slug='participant-new-work';project.thumbnail={src:'https://external.example/image.png',width:100,height:100,alt:{ko:'a',en:'a'},caption:{ko:'a',en:'a'}};assert.throws(()=>mergeStudio(catalog,'frondward',payload),/호스트가 먼저/);
  assert.equal(JSON.stringify(catalog),before);
});

test('private drafts detect concurrent saves; submissions are deduplicated and never claim publication before public content matches',async()=>{
  const {sql,env}=database(),token='b'.repeat(72),user='123456789012345678';sql.prepare('INSERT INTO studio_hosts VALUES(?)').run(user);
  sql.prepare('INSERT INTO studio_sessions VALUES(?,?,?,?)').run(await hash(token),user,'Host',Math.floor(Date.now()/1000)+600);
  sql.prepare('INSERT INTO studio_members VALUES(?,?)').run(user,'frondward');
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json(catalog);
  const call=(action,data,id)=>studioDrafts(new Request('https://induo.works/api/studio/'+action+'?owner=frondward'+(id?'&id='+id:''),{method:data?'POST':'GET',headers:{Cookie:'__Host-induo-session='+token,Origin:'https://induo.works','Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),env,action);
  try{
    const initial=await(await call('draft')).json(),payload=initial.payload;
    payload.room.floors[0].wallHeight=110;
    const input={baseHash:initial.baseHash,revision:0,payload};
    await assert.rejects(call('draft',{...input,revision:9}),error=>error.status===409);
    assert.equal((await(await call('draft',input)).json()).revision,1);
    await assert.rejects(call('draft',input),error=>error.status===409);
    assert.equal((await(await call('draft',{...input,revision:1})).json()).revision,2);
    const submitted=await(await call('submit',{...input,revision:2,reason:'Change my wall'})).json();assert.equal(submitted.status,'pending');
    const download=await call('proposal',undefined,submitted.id);assert.match(download.headers.get('Content-Disposition'),/^attachment;/);assert.deepEqual((await download.json()).payload,payload);
    await assert.rejects(call('submit',{...input,revision:2,reason:'Duplicate'}),error=>error.status===409);
    await assert.rejects(call('published',{},submitted.id),error=>error.status===409);
    assert.equal(sql.prepare('SELECT status FROM studio_proposals').get().status,'pending');
    globalThis.fetch=async()=>Response.json(mergeStudio(catalog,'frondward',payload));
    await call('published',{},submitted.id);assert.equal(sql.prepare('SELECT status FROM studio_proposals').get().status,'published');
    await assert.rejects(call('published',{},submitted.id),error=>error.status===409);
    await assert.rejects(call('draft',{...input,revision:2}),error=>error.status===409);
  }finally{globalThis.fetch=originalFetch;sql.close();}
});
