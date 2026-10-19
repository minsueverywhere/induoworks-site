import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {recordVisit,visitStats,visitDay} from '../src/server/site-visits.ts';
import {hash} from '../src/server/studio-auth.ts';

const studioSchema=await readFile(new URL('../migrations/0001_studio.sql',import.meta.url),'utf8')+await readFile(new URL('../migrations/0002_studio_hosts.sql',import.meta.url),'utf8');
function database(){
  const sql=new DatabaseSync(':memory:');sql.exec(studioSchema);
  const statement=(text,values=[])=>({bind:(...next)=>statement(text,next),first:async()=>sql.prepare(text).get(...values)||null,all:async()=>({results:sql.prepare(text).all(...values)}),run:async()=>sql.prepare(text).run(...values)});
  return {sql,env:{STUDIO_DB:{prepare:text=>statement(text),batch:async items=>{for(const item of items)await item.run();}}}};
}
const device='3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b';
const visit=(body,headers={})=>new Request('https://induo.works/api/studio/visit',{method:'POST',headers:{Origin:'https://induo.works','Content-Type':'application/json','User-Agent':'Mozilla/5.0',...headers},body:JSON.stringify(body)});

test('visits count views, sessions, daily devices and new devices without storing the raw ID',async()=>{
  const {sql,env}=database(),day1=Date.UTC(2026,9,19,3),day2=day1+86400_000;
  assert.equal((await recordVisit(visit({device,visit:true}),env,day1)).status,204);
  await recordVisit(visit({device,visit:false}),env,day1);
  await recordVisit(visit({device,visit:true}),env,day2);
  await recordVisit(visit({device:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',visit:true}),env,day2);
  assert.deepEqual({...sql.prepare('SELECT views,visits,devices,new_devices FROM site_visit_days WHERE day=?').get(visitDay(day1))},{views:2,visits:1,devices:1,new_devices:1});
  assert.deepEqual({...sql.prepare('SELECT views,visits,devices,new_devices FROM site_visit_days WHERE day=?').get(visitDay(day2))},{views:2,visits:2,devices:2,new_devices:1});
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM site_devices').get().n,2);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM site_devices WHERE hash=?').get(device).n,0,'raw IDs are never stored');
});

test('bots, foreign origins and malformed IDs are not counted',async()=>{
  const {sql,env}=database();
  assert.equal((await recordVisit(visit({device,visit:true},{'User-Agent':'Discordbot/2.0'}),env)).status,204);
  await assert.rejects(recordVisit(visit({device,visit:true},{Origin:'https://evil.example'}),env),/허용되지/);
  await assert.rejects(recordVisit(visit({device:'not-an-id',visit:true}),env),/잘못된/);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='site_visit_days'").get().n,0,'nothing was written');
});

test('days follow Korean time and stats are host-only',async()=>{
  assert.equal(visitDay(Date.UTC(2026,9,19,15,30)),'2026-10-20');
  const {sql,env}=database();await recordVisit(visit({device,visit:true}),env);
  await assert.rejects(visitStats(new Request('https://induo.works/api/studio/visit-stats'),env),/로그인/);
  const token='a'.repeat(72);
  sql.prepare('INSERT INTO studio_sessions(hash,user_id,name,expires) VALUES(?,?,?,?)').run(await hash(token),'42','Host',Math.floor(Date.now()/1000)+600);
  const request=()=>new Request('https://induo.works/api/studio/visit-stats',{headers:{Cookie:'__Host-induo-session='+token}});
  await assert.rejects(visitStats(request(),env),/호스트만/);
  sql.prepare('INSERT INTO studio_hosts(user_id) VALUES(?)').run('42');
  const data=await (await visitStats(request(),env)).json();
  assert.deepEqual(data.total,{views:1,visits:1,devices:1});assert.equal(data.days.length,1);
});
