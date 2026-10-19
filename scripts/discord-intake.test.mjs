import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdtemp,mkdir,writeFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {discordIntake,limitedBytes,expireUploads} from '../src/server/discord-intake.mjs';
import {createDiscordReview,importedWork,publishedWork} from './discord-review.mjs';
import {createEditorStore} from './editor-store.mjs';
import {validateCatalog,resolveMedia,CONTENT_ORIGIN} from '../src/content-schema.mjs';
import {contentWorks} from '../src/scripts/content-catalog.mjs';
import {createVillageMusic} from '../src/scripts/village-music.mjs';
const catalog=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8'));
const migrations=await Promise.all(['0001_studio.sql','0002_studio_hosts.sql','0003_discord_intake.sql'].map(file=>readFile(new URL('../migrations/'+file,import.meta.url),'utf8')));
const keys=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),publicKey=Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('hex');
const png=await sharp({create:{width:20,height:12,channels:3,background:'#edcba9'}}).png().toBuffer();
const USER='123456789012345678',APP='1469603219695992895',GUILD='1560135939290832990';
function fixture(t){
  const sql=new DatabaseSync(':memory:');sql.exec(migrations.join('\n'));t.after(()=>sql.close());sql.prepare('INSERT INTO studio_members VALUES(?,?)').run(USER,'frondward');
  const db={prepare(text){return {bind(...values){const statement=sql.prepare(text),args=values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return {first:async()=>statement.get(...args)||null,all:async()=>({results:statement.all(...args)}),run:async()=>statement.run(...args)};}};},async batch(items){sql.exec('BEGIN');try{for(const item of items)await item.run();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const query=async text=>text.split(';').filter(s=>s.trim()).flatMap(s=>sql.prepare(s).all());
  return {sql,query,env:{STUDIO_DB:db,DISCORD_PUBLIC_KEY:publicKey,DISCORD_CLIENT_ID:APP,DISCORD_GUILD_ID:GUILD,STUDIO_RATE_LIMITER:{limit:async()=>({success:true})}}};
}
function interaction(id='160000000000000001'){
  return {id,application_id:APP,guild_id:GUILD,type:2,token:'short-lived-test-token',member:{user:{id:USER}},data:{name:'submit-work',options:[{name:'worker',value:'frondward'},{name:'title',value:'Test artwork'},{name:'description',value:'A test image'},{name:'file',value:'file'}],resolved:{attachments:{file:{filename:'art.png',size:png.length,url:'https://cdn.discordapp.com/ephemeral-attachments/123/456/art.png?ex=test'}}}}};
}
async function signed(value,time=Math.floor(Date.now()/1000)){
  const body=JSON.stringify(value),signature=await crypto.subtle.sign('Ed25519',keys.privateKey,new TextEncoder().encode(time+body));
  return new Request('https://induo.works/api/discord-work',{method:'POST',body,headers:{'Content-Type':'application/json','x-signature-timestamp':String(time),'x-signature-ed25519':Buffer.from(signature).toString('hex')}});
}
async function submit(env,value=interaction(),bytes=png){
  const jobs=[],messages=[];let downloads=0;
  const response=await discordIntake(await signed(value),env,job=>jobs.push(job),async(url,options)=>{
    if(url.startsWith('https://cdn.discordapp.com/')){downloads++;assert.equal(options.redirect,'manual');return new Response(bytes);}
    messages.push(JSON.parse(options.body));return Response.json({id:'reply'});
  });await Promise.all(jobs);return {response,messages,downloads};
}
test('Discord submissions require fresh signed guild interactions and workshop membership',async t=>{
  const f=fixture(t),request=await signed(interaction());request.headers.set('x-signature-ed25519','0'.repeat(128));
  assert.equal((await discordIntake(request,f.env,()=>{})).status,401);
  assert.equal((await discordIntake(await signed(interaction(),Math.floor(Date.now()/1000)-600),f.env,()=>{})).status,401);
  const wrong=interaction();wrong.guild_id='other';assert.match((await(await submit(f.env,wrong)).response.json()).data.content,/only available/);
  f.sql.exec('DELETE FROM studio_members');const denied=await submit(f.env);assert.equal(denied.downloads,0);assert.match((await denied.response.json()).data.content,/connect your Discord/);
});
test('accepted file is privately chunked, deduplicated and never stores an interaction token or CDN URL',async t=>{
  const f=fixture(t),result=await submit(f.env);assert.equal((await result.response.json()).type,5);assert.equal(result.messages[0].allowed_mentions.parse.length,0);
  const row=f.sql.prepare('SELECT * FROM studio_uploads').get();assert.equal(row.status,'pending');assert.equal(row.size,png.length);assert.match(row.sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(Buffer.from(f.sql.prepare('SELECT bytes FROM studio_upload_chunks').get().bytes),png);
  assert.ok(!JSON.stringify(row).includes('test-token'));assert.ok(!JSON.stringify(row).includes('cdn.discordapp.com'));
  assert.equal((await submit(f.env)).downloads,0);
});
test('format, byte limits, SSRF URLs and per-account quota fail before publication',async t=>{
  const f=fixture(t);
  for(const change of [a=>a.filename='file.wav',a=>a.size=8*1024*1024+1,a=>a.url='https://127.0.0.1/file.png']){
    const value=interaction();change(value.data.resolved.attachments.file);assert.equal((await submit(f.env,value)).downloads,0);
  }
  const bad=interaction();bad.data.resolved.attachments.file.size=5;await submit(f.env,bad,Buffer.from('hello'));assert.equal(f.sql.prepare('SELECT status FROM studio_uploads').get().status,'failed');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM studio_upload_chunks').get().n,0);
  for(let n=2;n<=4;n++)await submit(f.env,interaction('16000000000000000'+n));
  assert.equal((await submit(f.env,interaction('160000000000000005'))).downloads,0);
  await assert.rejects(limitedBytes(new Response(new Uint8Array(12)),10),/too large/);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM studio_uploads WHERE status='pending'").get().n,3);
});
test('pending files expire while uncertain publishing records retain their recovery data',async t=>{
  const f=fixture(t);await submit(f.env);f.sql.exec('UPDATE studio_uploads SET expires=0');await expireUploads(f.env.STUDIO_DB);assert.equal(f.sql.prepare('SELECT status FROM studio_uploads').get().status,'expired');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM studio_upload_chunks').get().n,0);
  await submit(f.env,interaction('160000000000000002'));f.sql.exec("UPDATE studio_uploads SET status='publishing',expires=0 WHERE id='160000000000000002'");await expireUploads(f.env.STUDIO_DB);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM studio_upload_chunks').get().n,1);
});

test('global byte quota and chunk ordering bound storage even across simultaneous submissions',async t=>{
  const f=fixture(t),large=Buffer.alloc(1024*1024+5);Buffer.from('OggS').copy(large);Buffer.from('OpusHead').copy(large,28);
  const value=interaction();Object.assign(value.data.resolved.attachments.file,{filename:'song.ogg',size:large.length});await submit(f.env,value,large);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM studio_upload_chunks').get().n,3);
  const rows=f.sql.prepare('SELECT part,bytes FROM studio_upload_chunks ORDER BY part').all();assert.deepEqual(Buffer.concat(rows.map(r=>Buffer.from(r.bytes))),large);
  const results=await Promise.all([2,3,4].map(n=>submit(f.env,interaction('16000000000000000'+n))));assert.equal(results.filter(r=>r.downloads).length,2);
  f.sql.exec("UPDATE studio_uploads SET status='rejected'; DELETE FROM studio_upload_chunks");
  const insert=f.sql.prepare("INSERT INTO studio_uploads(id,user_id,worker_id,title,description,filename,size,kind,status,created,expires) VALUES(?,?,'frondward','full','queue','work.mp3',8388608,'music','pending',?,?)");
  for(let n=0;n<8;n++)insert.run('17000000000000000'+n,'other-user-'+n,Date.now(),Date.now()+86400000);
  assert.equal((await submit(f.env,interaction('180000000000000001'))).downloads,0);
});

test('Workers-compatible manual mode refuses a CDN redirect without fetching its destination',async t=>{
  const f=fixture(t),jobs=[],urls=[];
  await discordIntake(await signed(interaction()),f.env,job=>jobs.push(job),async(url,options)=>{
    urls.push(url);if(url.startsWith('https://cdn.discordapp.com/')){assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://private.example/file.png'}});}return Response.json({id:'reply'});
  });await Promise.all(jobs);assert.equal(f.sql.prepare('SELECT status FROM studio_uploads').get().status,'failed');assert.ok(urls.every(url=>!url.includes('private.example')));
});
test('host approval imports, saves and publishes content once; rejection and uncertain deployment preserve correct state',async t=>{
  const f=fixture(t),root=await mkdtemp(join(tmpdir(),'induo-intake-test-'));
  t.after(()=>rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));await mkdir(join(root,'content'),{recursive:true});await writeFile(join(root,'content/catalog.json'),JSON.stringify(catalog));await cp(new URL('../public/',import.meta.url),join(root,'public'),{recursive:true});await cp(new URL('../content/files/',import.meta.url),join(root,'content/files'),{recursive:true});
  let calls=0,publicCatalog=catalog;
  const review=createDiscordReview(root,{query:f.query,deploy:async()=>{calls++;publicCatalog=(await createEditorStore(root).read()).catalog;return 'content deployed';},fetcher:async()=>Response.json(publicCatalog)});
  await submit(f.env);const row=f.sql.prepare('SELECT * FROM studio_uploads').get();assert.equal((await review.preview(row.id)).mime,'image/png');
  const revision=(await createEditorStore(root).read()).revision;await assert.rejects(review.approve({id:row.id,revision:'old'}),/바뀌었습니다/);
  await review.approve({id:row.id,revision});assert.equal(calls,1);assert.equal(f.sql.prepare('SELECT status FROM studio_uploads').get().status,'published');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM studio_upload_chunks').get().n,0);
  assert.ok(publishedWork(publicCatalog,row));assert.ok(contentWorks(publicCatalog,'ko').some(w=>w.id==='media:discord-'+row.id));await assert.rejects(review.approve({id:row.id,revision:(await createEditorStore(root).read()).revision}),/이미 처리/);
  await submit(f.env,interaction('160000000000000002'));await review.reject('160000000000000002');assert.equal(f.sql.prepare("SELECT status FROM studio_uploads WHERE id='160000000000000002'").get().status,'rejected');
  await submit(f.env,interaction('160000000000000003'));
  const uncertain=createDiscordReview(root,{query:f.query,deploy:async()=>{throw Error('timeout');}});await assert.rejects(uncertain.approve({id:'160000000000000003',revision:(await createEditorStore(root).read()).revision}),/자동 재시도하지/);assert.equal(f.sql.prepare("SELECT status FROM studio_uploads WHERE id='160000000000000003'").get().status,'publishing');await assert.rejects(review.reject('160000000000000003'),/검토 대기/);
});
test('single-format music keeps native lazy playback and Works links without an invented alternate format',async()=>{
  const sha='a'.repeat(64),row={id:'160000000000000001',worker_id:'frondward',title:'Song',description:'Album',kind:'music',filename:'work.mp3',sha256:sha,size:123};
  const next=importedWork(catalog,row,{original:'/uploads/'+sha.slice(0,20)+'.mp3'},42),resolved=resolveMedia(next,CONTENT_ORIGIN),track=resolved.tracks.at(-1);
  assert.equal(track.sources.ogg,undefined);assert.ok(contentWorks(resolved,'ko').find(w=>w.kind==='music'&&w.summary.includes('Song')).href.includes('/work/soundtrack/'));assert.ok(publishedWork(next,row));
  let audio;const player=createVillageMusic({sources:track.sources,onState(){},createAudio:()=>audio={canPlayType:()=>true,addEventListener(){},play:async()=>{},pause(){}}});assert.equal(audio,undefined);await player.toggle();assert.equal(audio.preload,'none');assert.ok(audio.src.endsWith('.mp3'));validateCatalog(next);
});
