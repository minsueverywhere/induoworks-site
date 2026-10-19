import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {discordLogin,discordCallback,session,authorize,sameOrigin,logout,hash,workerProfiles} from '../src/server/studio-auth.ts';
import {studioSlice,mergeStudio,studioChanges} from '../src/server/studio-content.mjs';
import {studioDrafts} from '../src/server/studio-drafts.ts';
import {studioGuestbook} from '../src/server/studio-guestbook.ts';
import {studioVillage} from '../src/server/studio-village.ts';
import {villageSlice,mergeVillage} from '../src/server/studio-village-layout.mjs';
import {studioRooms} from '../src/server/studio-rooms.ts';
const schema=await readFile(new URL('../migrations/0001_studio.sql',import.meta.url),'utf8')+await readFile(new URL('../migrations/0002_studio_hosts.sql',import.meta.url),'utf8')+await readFile(new URL('../migrations/0004_studio_rooms.sql',import.meta.url),'utf8');
const guestbookSchema=await readFile(new URL('../migrations/0005_studio_guestbook.sql',import.meta.url),'utf8')+await readFile(new URL('../migrations/0006_guestbook_identity.sql',import.meta.url),'utf8')+await readFile(new URL('../migrations/0007_guestbook_replies.sql',import.meta.url),'utf8')+await readFile(new URL('../migrations/0008_guestbook_reply_targets.sql',import.meta.url),'utf8')+await readFile(new URL('../migrations/0009_guestbook_notebooks_contacts.sql',import.meta.url),'utf8');
const villageSchema=await readFile(new URL('../migrations/0010_studio_village.sql',import.meta.url),'utf8');
const awaitProfileSchema=await readFile(new URL('../migrations/0011_studio_worker_profiles.sql',import.meta.url),'utf8');
const catalog=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8'));
function database(){
  const sql=new DatabaseSync(':memory:');sql.exec(schema+guestbookSchema);sql.exec(villageSchema);sql.exec(awaitProfileSchema);
  const wrap=statement=>({bind(...values){const s=sql.prepare(statement);return{first:async()=>s.get(...values)||null,all:async()=>({results:s.all(...values)}),run:async()=>s.run(...values)};}});
  return{sql,env:{STUDIO_DB:{prepare:wrap,batch:async items=>{for(const item of items)await item.run();}},STUDIO_RATE_LIMITER:{limit:async()=>({success:true})},DISCORD_GUILD_ID:'123456789012345679',DISCORD_CLIENT_ID:'test-id',DISCORD_CLIENT_SECRET:'test-secret'}};
}
test('Discord state is browser-bound and single-use; sessions contain no provider token and permissions come from the database',async()=>{
  const {sql,env}=database();const start=await discordLogin(new Request('https://induo.works/api/studio/login'),env),url=new URL(start.headers.get('Location'));
  assert.equal(url.searchParams.get('scope'),'identify guilds.members.read');const state=url.searchParams.get('state');
  const callback=(cookie=state)=>new Request('https://induo.works/api/studio/callback?code=test&state='+state,{headers:{Cookie:'__Host-induo-oauth='+cookie}});
  sql.prepare('INSERT INTO studio_members VALUES(?,?)').run('123456789012345678','personal');
  sql.prepare('INSERT INTO studio_worker_profiles VALUES(?,?,?,?)').run('personal','123456789012345678','Old name',0);
  let calls=0;const fetcher=async()=>Response.json(++calls===1?{access_token:'provider-secret',scope:'identify guilds.members.read'}:calls===2?{id:'123456789012345678',username:'Test',global_name:'Main name'}:{nick:'Server nickname'});
  await assert.rejects(discordCallback(callback('wrong'),env,fetcher),/확인 정보/);assert.equal(calls,0);
  const response=await discordCallback(callback(),env,fetcher),cookies=response.headers.getSetCookie();assert.ok(cookies.every(c=>c.includes('Secure; HttpOnly; SameSite=Lax')));
  const cookie=cookies.find(c=>c.startsWith('__Host-induo-session=')).split(';')[0];assert.ok(!cookie.includes('provider-secret'));
  await assert.rejects(discordCallback(callback(),env,fetcher),/만료/);assert.equal(calls,3);
  const request=new Request('https://induo.works/api/studio/session',{headers:{Cookie:cookie}});
  assert.equal(sql.prepare('SELECT display_name FROM studio_worker_profiles').get().display_name,'Server nickname');
  assert.deepEqual((await session(request,env)).owners,['personal']);assert.equal((await session(request,env)).name,'Server nickname');await assert.rejects(authorize(request,env,'frondward'),error=>error.status===403);
  sql.prepare("DELETE FROM studio_members WHERE worker_id='personal'").run();
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

test('proposal import summary names the target studio and surfaces added, removed and relinked Works',()=>{
  const payload=structuredClone(studioSlice(catalog,'frondward')),[first]=payload.projects;
  assert.deepEqual(studioChanges(catalog,'frondward',payload).lines,[]);
  const added={...structuredClone(first),slug:'participant-new-work',title:{ko:'새 작품',en:'New work'}};first.href='https://phish.example/login';payload.projects.push(added);
  const {name,lines}=studioChanges(catalog,'frondward',payload);
  assert.equal(name,catalog.workers.find(w=>w.id==='frondward').name);
  assert.ok(lines.includes('작품 수정: '+first.title.ko)&&lines.includes('  외부 링크(href): https://phish.example/login')&&lines.includes('작품 추가: 새 작품'));
  payload.projects=[];assert.ok(studioChanges(catalog,'frondward',payload).lines.includes('작품 삭제: '+first.title.ko));
});
test('session lookups and logout are rate limited like the other studio routes',async()=>{
  const {sql,env}=database(),limited={...env,STUDIO_RATE_LIMITER:{limit:async()=>({success:false})}};
  await assert.rejects(logout(new Request('https://induo.works/api/studio/logout',{method:'POST',headers:{Origin:'https://induo.works','Content-Type':'application/json'},body:'{}'}),limited),error=>error.status===429);
  const route=await readFile(new URL('../src/pages/api/studio/[action].ts',import.meta.url),'utf8');
  assert.match(route,/action==='session'\)\{await rateLimit\(/);sql.close();
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


test('room self-publication restricts ownership and shape, detects conflicts and keeps one reversible version',async()=>{
  const {sql,env}=database(),token='c'.repeat(72),user='room-user';
  sql.prepare('INSERT INTO studio_sessions VALUES(?,?,?,?)').run(await hash(token),user,'Test',Math.floor(Date.now()/1000)+600);
  sql.prepare('INSERT INTO studio_members VALUES(?,?)').run(user,'frondward');
  const original=globalThis.fetch;globalThis.fetch=async()=>Response.json(catalog);
  const call=(data,owner='frondward',action='room')=>studioRooms(new Request('https://induo.works/api/studio/'+action+'?owner='+owner,{method:data?'POST':'GET',headers:{Cookie:'__Host-induo-session='+token,Origin:'https://induo.works','Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),env,action);
  try{
    const initial=await(await call()).json(),room=structuredClone(initial.payload.room);room.floors[0].wallHeight=120;room.hiddenItems=['frondward:grench-boss'];room.floors[0].tiles.find(t=>t.x===0&&t.y===0).type='transparent';
    await assert.rejects(call({revision:0,room},'induo-works'),error=>error.status===403);
    await assert.rejects(call({revision:0,room,projects:[]}),error=>error.status===409);
    assert.equal((await(await call({revision:0,room})).json()).revision,1);
    await assert.rejects(call({revision:0,room}),error=>error.status===409);
    await assert.rejects(call({revision:1,room}),error=>error.status===429);
    const publicRoom=await call(undefined,'frondward','room-view');assert.equal(publicRoom.headers.get('Cache-Control'),'public, max-age=0, s-maxage=15');const publicData=await publicRoom.json();assert.deepEqual(Object.keys(publicData).sort(),['revision','room']);assert.deepEqual(publicData.room,room);
    sql.exec('UPDATE studio_rooms SET updated=0');
    const restored=await(await call({revision:1,restore:true})).json();assert.deepEqual(restored.room,initial.payload.room);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM studio_rooms').get().n,1);
    sql.prepare('DELETE FROM studio_members').run();await assert.rejects(call(),error=>error.status===403);
  }finally{globalThis.fetch=original;sql.close();}
});


test('public room cache omits credentials and uses one canonical key across query variations',async()=>{
  const {sql,env}=database(),stored=new Map(),keys=[];
  const cache={match:async key=>{keys.push(key.url);return stored.get(key.url)?.clone();},put:async(key,response)=>stored.set(key.url,response)};
  const call=query=>studioRooms(new Request('https://induo.works/api/studio/room-view?owner=frondward&'+query,{headers:{Cookie:'private'}}),env,'room-view',cache);
  const response=await call('noise=one');assert.equal(response.headers.get('Cache-Control'),'public, max-age=0, s-maxage=15');assert.equal(response.headers.has('Set-Cookie'),false);
  sql.close();
  assert.deepEqual(await(await call('noise=two')).json(),{room:null,revision:0});assert.equal(keys[0],keys[1]);
});

test('guestbook requires a placed book and login for writes, enforces cooldown and lets only author or room owner moderate',async()=>{
  const {sql,env}=database(),original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json(catalog);
  const token='12345678-1234-1234-1234-123456789012'.repeat(2),cookie='__Host-induo-session='+token;
  sql.prepare('INSERT INTO studio_sessions(hash,user_id,name,expires) VALUES(?,?,?,?)').run(await hash(token),'visitor','Visitor',Math.floor(Date.now()/1000)+1000);
  const call=(method='GET',input,auth=true,owner='frondward')=>studioGuestbook(new Request('https://induo.works/api/studio/guestbook?owner='+owner,{method,headers:{...(auth?{Cookie:cookie}:{}),Origin:'https://induo.works','Content-Type':'application/json'},body:input?JSON.stringify(input):undefined}),env);
  try{
    await assert.rejects(call(),e=>e.status===404);
    sql.prepare('INSERT INTO studio_rooms(worker_id,room,previous_room,revision,updated) VALUES(?,?,?,1,0)').run('frondward',JSON.stringify({floors:[{exhibits:[{kind:'guestbook'}]}]}),'{}');
    const publicRead=await(await call('GET',undefined,false)).json();assert.equal(publicRead.canWrite,false);
    await assert.rejects(call('POST',{message:'hello'},false),e=>e.status===401);
    await assert.rejects(call('POST',{message:'x'.repeat(301)}),e=>e.status===400);
    const posted=await(await call('POST',{message:'<script>hello</script>'})).json();assert.equal(posted.entries[0].message,'<script>hello</script>');assert.equal(posted.entries[0].canDelete,true);assert.equal('user_id' in posted.entries[0],false);
    assert.equal((await call('POST',{message:'again'})).status,429);
    const id=posted.entries[0].id;
    sql.prepare('UPDATE studio_sessions SET user_id=?').run('other');
    await assert.rejects(call('DELETE',{id}),e=>e.status===403);
    sql.prepare('INSERT INTO studio_members(user_id,worker_id) VALUES(?,?)').run('other','frondward');
    assert.equal((await(await call('DELETE',{id})).json()).entries.length,0);
    const payload=studioSlice(catalog,'frondward');payload.room.floors[0].exhibits.push({id:'book',kind:'guestbook',ref:'guestbook',x:0,y:0,width:1,depth:1});
    assert.doesNotThrow(()=>mergeStudio(catalog,'frondward',payload));
  }finally{globalThis.fetch=original;sql.close();}
});

test('server nickname lookup falls back only for a missing nickname or membership and fails closed on API or scope failure',async()=>{
 for(const scenario of ['no-nick','not-member','api-error','missing-scope']){
  const {sql,env}=database();
  try{
   const start=await discordLogin(new Request('https://induo.works/api/studio/login'),env),state=new URL(start.headers.get('Location')).searchParams.get('state');
   const request=new Request('https://induo.works/api/studio/callback?code=test&state='+state,{headers:{Cookie:'__Host-induo-oauth='+state}});
   const urls=[],fetcher=async url=>{urls.push(url);if(urls.length===1)return Response.json({access_token:'private',scope:scenario==='missing-scope'?'identify':'identify guilds.members.read'});if(urls.length===2)return Response.json({id:'123456789012345678',global_name:'Main display',username:'username'});return scenario==='not-member'?new Response(null,{status:404}):scenario==='api-error'?new Response(null,{status:503}):Response.json({nick:null});};
   if(['api-error','missing-scope'].includes(scenario)){await assert.rejects(discordCallback(request,env,fetcher),e=>e.status===(scenario==='api-error'?502:403));assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM studio_sessions').get().n,0);}
   else{await discordCallback(request,env,fetcher);assert.equal(sql.prepare('SELECT name FROM studio_sessions').get().name,'Main display');assert.ok(urls[2].endsWith('/'+env.DISCORD_GUILD_ID+'/member'));}
  }finally{sql.close();}
 }
});

test('guestbook badges are server-owned and hiding names requires a linked Worker, never host privileges alone',async()=>{
 const {sql,env}=database(),original=globalThis.fetch;globalThis.fetch=async()=>Response.json(catalog);
 const token='12345678-1234-1234-1234-123456789012'.repeat(2),cookie='__Host-induo-session='+token;
 sql.prepare('INSERT INTO studio_sessions(hash,user_id,name,expires) VALUES(?,?,?,?)').run(await hash(token),'visitor','Server nickname',Math.floor(Date.now()/1000)+1000);
 sql.prepare('INSERT INTO studio_rooms(worker_id,room,previous_room,revision,updated) VALUES(?,?,?,1,0)').run('frondward',JSON.stringify({floors:[{exhibits:[{kind:'guestbook'}]}]}),'{}');
 const call=input=>studioGuestbook(new Request('https://induo.works/api/studio/guestbook?owner=frondward',{method:input?'POST':'GET',headers:{Cookie:cookie,Origin:'https://induo.works','Content-Type':'application/json'},body:input?JSON.stringify(input):undefined}),env);
 try{
  assert.deepEqual((await(await call()).json()).identity,{name:'Server nickname',teams:[]});
  sql.prepare('INSERT INTO studio_hosts(user_id) VALUES(?)').run('visitor');
  for(const input of [{message:'hi',team:'frondward'},{message:'hi',hideName:true}])await assert.rejects(call(input),e=>e.status===403);
  await assert.rejects(call({message:'hi',name:'forged'}),e=>e.status===400);
  sql.prepare('INSERT INTO studio_members(user_id,worker_id) VALUES(?,?)').run('visitor','frondward');
  const identity=(await(await call()).json()).identity;assert.equal(identity.teams[0].name,'Frondward');
  const hidden=(await(await call({message:'Team greeting',team:'frondward',hideName:true})).json()).entries[0];assert.equal(hidden.name,'');assert.equal(hidden.author_worker_id,'frondward');assert.equal(hidden.author_team_name,'Frondward');assert.equal(hidden.canDelete,true);
  sql.exec('UPDATE studio_guestbook SET created=1;UPDATE studio_guestbook_cooldowns SET last_created=1');
  const named=(await(await call({message:'Personal greeting',team:'frondward',hideName:false})).json()).entries[0];assert.equal(named.name,'Server nickname');assert.equal(named.author_team_name,'Frondward');
 }finally{globalThis.fetch=original;sql.close();}
});

test('guestbook threads reject foreign targets and flatten replies to replies and preserve other authors replies when a parent is deleted',async()=>{
 const {sql,env}=database(),original=globalThis.fetch;globalThis.fetch=async()=>Response.json(catalog);
 const token='12345678-1234-1234-1234-123456789012'.repeat(2),cookie='__Host-induo-session='+token;
 sql.prepare('INSERT INTO studio_sessions(hash,user_id,name,expires) VALUES(?,?,?,?)').run(await hash(token),'writer-a','Writer A',Math.floor(Date.now()/1000)+1000);
 sql.prepare('INSERT INTO studio_rooms(worker_id,room,previous_room,revision,updated) VALUES(?,?,?,1,0)').run('frondward',JSON.stringify({floors:[{exhibits:[{kind:'guestbook'}]}]}),'{}');
 const call=(method='GET',input)=>studioGuestbook(new Request('https://induo.works/api/studio/guestbook?owner=frondward',{method,headers:{Cookie:cookie,Origin:'https://induo.works','Content-Type':'application/json'},body:input?JSON.stringify(input):undefined}),env);
 try{
  const root=(await(await call('POST',{message:'A root'})).json()).entries[0];
  sql.prepare('UPDATE studio_sessions SET user_id=?,name=?').run('writer-b','Writer B');
  const data=await(await call('POST',{message:'A reply',parent:root.id})).json(),reply=data.entries[0].replies[0];assert.equal(data.entries.length,1);assert.equal(reply.message,'A reply');assert.equal(reply.parent_id,root.id);assert.equal('user_id' in reply,false);assert.equal(reply.canDelete,true);assert.equal(data.entries[0].canDelete,false);
  sql.prepare('UPDATE studio_sessions SET user_id=?,name=?').run('writer-c','Writer C');
  const nested=(await(await call('POST',{message:'Nested',parent:reply.id})).json()).entries[0].replies[1];assert.equal(nested.parent_id,root.id);assert.equal(nested.reply_to_id,reply.id);assert.equal(nested.replyTo.name,'Writer B');
  await call('DELETE',{id:nested.id});sql.prepare('UPDATE studio_sessions SET user_id=?').run('writer-b');
  sql.prepare('INSERT INTO studio_guestbook(id,worker_id,user_id,name,message,created) VALUES(?,?,?,?,?,?)').run('12345678-1234-1234-1234-123456789012','another-room','someone','Other','Foreign',1);
  await assert.rejects(call('POST',{message:'Foreign reply',parent:'12345678-1234-1234-1234-123456789012'}),e=>e.status===404);
  await assert.rejects(call('DELETE',{id:root.id}),e=>e.status===403);
  sql.prepare('UPDATE studio_sessions SET user_id=?').run('writer-a');
  const removed=(await(await call('DELETE',{id:root.id})).json()).entries[0];assert.equal(removed.deleted,true);assert.equal(removed.name,'');assert.equal(removed.author_team_name,null);assert.equal(removed.replies[0].message,'A reply');assert.equal(removed.canDelete,false);
  await assert.rejects(call('POST',{message:'Deleted root',parent:root.id}),e=>e.status===404);
  sql.prepare('UPDATE studio_sessions SET user_id=?').run('writer-b');assert.equal((await(await call('DELETE',{id:reply.id})).json()).entries.length,0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM studio_guestbook WHERE worker_id=?').get('frondward').n,0);
 }finally{globalThis.fetch=original;sql.close();}
});

test('guestbook reports remaining seconds and deleting a recent post cannot reset the shared cooldown',async()=>{
 const {sql,env}=database(),original=globalThis.fetch;globalThis.fetch=async()=>Response.json(catalog);
 const token='12345678-1234-1234-1234-123456789012'.repeat(2),cookie='__Host-induo-session='+token;
 sql.prepare('INSERT INTO studio_sessions(hash,user_id,name,expires) VALUES(?,?,?,?)').run(await hash(token),'writer','Writer',Math.floor(Date.now()/1000)+1000);
 sql.prepare('INSERT INTO studio_rooms(worker_id,room,previous_room,revision,updated) VALUES(?,?,?,1,0)').run('frondward',JSON.stringify({floors:[{exhibits:[{kind:'guestbook'}]}]}),'{}');
 const call=(method='GET',input)=>studioGuestbook(new Request('https://induo.works/api/studio/guestbook?owner=frondward',{method,headers:{Cookie:cookie,Origin:'https://induo.works','Content-Type':'application/json'},body:input?JSON.stringify(input):undefined}),env);
 try{
  const first=await(await call('POST',{message:'First'})).json();assert.ok(first.retryAfter>0&&first.retryAfter<=60);
  const blocked=await call('POST',{message:'Too soon'});assert.equal(blocked.status,429);assert.ok((await blocked.json()).retryAfter>0);
  await call('DELETE',{id:first.entries[0].id});assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM studio_guestbook').get().n,0);assert.ok((await(await call()).json()).retryAfter>0);assert.equal((await call('POST',{message:'Still too soon'})).status,429);
  sql.prepare('UPDATE studio_guestbook_cooldowns SET last_created=?').run(Date.now()-61000);assert.equal((await call('POST',{message:'After waiting'})).status,200);
 }finally{globalThis.fetch=original;sql.close();}
});

test('separate feedback notes isolate reads, replies and deletion; personal contacts are opt-in and never leak for hidden names',async()=>{
 const {sql,env}=database(),original=globalThis.fetch,data=structuredClone(catalog);data.workers.find(w=>w.id==='frondward').contact={email:'team@example.com',discordUserId:'123456789012345678'};globalThis.fetch=async()=>Response.json(data);
 const token='12345678-1234-1234-1234-123456789012'.repeat(2),cookie='__Host-induo-session='+token,user='123456789012345679';
 sql.prepare('INSERT INTO studio_sessions(hash,user_id,name,expires) VALUES(?,?,?,?)').run(await hash(token),user,'Visitor',Math.floor(Date.now()/1000)+1000);
 sql.prepare('INSERT INTO studio_members(user_id,worker_id) VALUES(?,?)').run(user,'frondward');
 const room={floors:[{exhibits:[{kind:'guestbook'},{kind:'guestbook',boardId:'album-feedback',title:'Album feedback'}]}]};sql.prepare('INSERT INTO studio_rooms(worker_id,room,previous_room,revision,updated) VALUES(?,?,?,1,0)').run('frondward',JSON.stringify(room),'{}');
 const call=(board='main',method='GET',input)=>studioGuestbook(new Request('https://induo.works/api/studio/guestbook?owner=frondward&board='+board,{method,headers:{Cookie:cookie,Origin:'https://induo.works','Content-Type':'application/json'},body:input?JSON.stringify(input):undefined}),env);
 const reset=()=>sql.exec('UPDATE studio_guestbook_cooldowns SET last_created=1');
 try{
  const first=(await(await call('main','POST',{message:'Main note',team:'frondward'})).json()).entries[0];assert.deepEqual(first.contact,{email:null,discordUserId:null});assert.equal(first.user_id,undefined);assert.equal(first.team.contact.email,'team@example.com');
  assert.equal((await(await call('album-feedback')).json()).entries.length,0);
  await assert.rejects(call('album-feedback','POST',{message:'Wrong board',parent:first.id}),e=>e.status===404);
  await assert.rejects(call('album-feedback','DELETE',{id:first.id}),e=>e.status===404);
  await assert.rejects(call('missing'),e=>e.status===404);reset();
  const hidden=(await(await call('album-feedback','POST',{message:'Hidden',team:'frondward',hideName:true,email:'private@example.com',shareDiscord:true})).json()).entries[0];assert.equal(hidden.contact,null);assert.equal(hidden.name,'');
  const stored=sql.prepare('SELECT user_id,contact_email,contact_discord FROM studio_guestbook WHERE id=?').get(hidden.id);assert.equal(stored.user_id,user);assert.equal(stored.contact_email,null);assert.equal(stored.contact_discord,null);reset();
  const visible=(await(await call('album-feedback','POST',{message:'Contact',email:'public@example.com',shareDiscord:true})).json()).entries[0];assert.deepEqual(visible.contact,{email:'public@example.com',discordUserId:user});assert.equal(visible.contact_discord,undefined);assert.equal(visible.contact_email,undefined);
  assert.equal((await(await call('main')).json()).entries.length,1);
  for(const input of [{message:'Bad',shareDiscord:user},{message:'Bad',email:'bad\r\n@example.com'},{message:'Bad',contact_discord:'forged'}])await assert.rejects(call('main','POST',input),e=>e.status===400);
 }finally{globalThis.fetch=original;sql.close();}
});

test('only authenticated hosts can save village layouts; revisions, terrain, collision and unrelated Worker data are protected',async()=>{
 const {sql,env}=database(),original=globalThis.fetch;globalThis.fetch=async()=>Response.json(catalog);
 const token='12345678-1234-1234-1234-123456789012'.repeat(2),cookie='__Host-induo-session='+token,user='visitor';
 sql.prepare('INSERT INTO studio_sessions(hash,user_id,name,expires) VALUES(?,?,?,?)').run(await hash(token),user,'Visitor',Math.floor(Date.now()/1000)+1000);
 sql.prepare('INSERT INTO studio_members(user_id,worker_id) VALUES(?,?)').run(user,'frondward');
 const call=(method='GET',input,auth=true,action='village',origin='https://induo.works')=>studioVillage(new Request('https://induo.works/api/studio/'+action,{method,headers:{...(auth?{Cookie:cookie}:{}),Origin:origin,'Content-Type':'application/json'},body:input?JSON.stringify(input):undefined}),env,action);
 try{
  assert.equal((await(await call('GET',undefined,false,'village-view')).json()).layout,null);
  await assert.rejects(call('GET',undefined,false),e=>e.status===401);await assert.rejects(call(),e=>e.status===403);await assert.rejects(call('POST',{revision:0,layout:villageSlice(catalog)}),e=>e.status===403);
  sql.prepare('INSERT INTO studio_hosts(user_id) VALUES(?)').run(user);const initial=await(await call()).json();assert.equal(initial.revision,0);
  const layout=initial.payload;layout.world.tiles.push({x:-1,y:0,type:'grass'});
  const saved=await(await call('POST',{revision:0,layout})).json();assert.equal(saved.revision,1);assert.ok((await(await call('GET',undefined,false,'village-view')).json()).layout.world.tiles.some(t=>t.x===-1));
  await assert.rejects(call('POST',{revision:0,layout}),e=>e.status===409);await assert.rejects(call('POST',{revision:1,layout}),e=>e.status===429);await assert.rejects(call('POST',{revision:1,layout},true,'village','https://evil.example'),e=>e.status===403);
  sql.exec('UPDATE studio_village SET updated=1');
  const bad=structuredClone(layout);bad.houses[0].name='forged';await assert.rejects(call('POST',{revision:1,layout:bad}),e=>e.status===400);
  const overlap=structuredClone(layout);overlap.houses[0].house={...overlap.houses[0].house,x:layout.world.noticeboard.x,y:layout.world.noticeboard.y};await assert.rejects(call('POST',{revision:1,layout:overlap}),e=>e.status===400);
  const changed=mergeVillage(catalog,layout);assert.deepEqual(changed.projects,catalog.projects);assert.deepEqual(changed.workers.map(w=>w.name),catalog.workers.map(w=>w.name));
  await call('POST',{revision:1,layout});assert.ok(sql.prepare('SELECT previous_layout FROM studio_village').get().previous_layout);assert.equal((await(await call()).json()).revision,2);
 }finally{globalThis.fetch=original;sql.close();}
});


test('public personal-worker names omit account IDs and exclude shared or unlinked teams',async()=>{
  const {sql,env}=database();
  for(const [id,user]of [['personal','123456789012345678'],['shared','223456789012345678'],['orphan','323456789012345678']])sql.prepare('INSERT INTO studio_worker_profiles VALUES(?,?,?,?)').run(id,user,'Name '+id,0);
  for(const [id,user]of [['personal','123456789012345678'],['shared','223456789012345678'],['shared','423456789012345678']])sql.prepare('INSERT INTO studio_members VALUES(?,?)').run(user,id);
  const response=await workerProfiles(new Request('https://induo.works/api/studio/worker-profiles'),env);
  assert.deepEqual(await response.json(),[{id:'personal',name:'Name personal'}]);
  assert.equal(response.headers.get('Cache-Control'),'public, max-age=0, s-maxage=60');
  await assert.rejects(workerProfiles(new Request('https://induo.works/api/studio/worker-profiles',{method:'POST'}),env),e=>e.status===405);sql.close();
});
