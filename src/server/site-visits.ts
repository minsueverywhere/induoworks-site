import {StudioError,json,hash,session,studioDB,type StudioEnv} from './studio-auth.ts';

export interface VisitEnv extends StudioEnv {
  VISIT_RATE_LIMITER?: {limit(options:{key:string}):Promise<{success:boolean}>};
}

// The Worker creates the tables itself, so counting works without a manual D1 migration step.
const SCHEMA=[
  'CREATE TABLE IF NOT EXISTS site_visit_days(day TEXT PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0, visits INTEGER NOT NULL DEFAULT 0, devices INTEGER NOT NULL DEFAULT 0, new_devices INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS site_devices(hash TEXT PRIMARY KEY, first_day TEXT NOT NULL, last_day TEXT NOT NULL)',
];
const ready=new WeakMap<object,Promise<unknown>>();
function tables(db:D1Database){
  if(!ready.has(db))ready.set(db,db.batch(SCHEMA.map(sql=>db.prepare(sql))).catch(error=>{ready.delete(db);throw error;}));
  return ready.get(db)!;
}
// Days follow Korean time so a day's numbers match what the owner sees on the calendar.
export const visitDay=(time=Date.now())=>new Date(time+9*3600_000).toISOString().slice(0,10);
const BOT=/bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse/i;

export async function recordVisit(request:Request,env:VisitEnv,time=Date.now()){
  if(request.method!=='POST')throw new StudioError('POST 요청만 가능합니다.',405);
  if(request.headers.get('Origin')!=='https://induo.works')throw new StudioError('허용되지 않은 요청입니다.',403);
  if(BOT.test(request.headers.get('User-Agent')||''))return new Response(null,{status:204});
  if(env.VISIT_RATE_LIMITER&&!(await env.VISIT_RATE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)return new Response(null,{status:204});
  // A signed-in host is never counted, and the browser is told to stop sending visits for good.
  if(request.headers.get('Cookie')?.includes('__Host-induo-session=')){
    const user=await session(request,env).catch(()=>null);
    if(user?.host)return new Response(null,{status:204,headers:{'Cache-Control':'no-store','X-Visit-Excluded':'host'}});
  }
  const body=await request.json().catch(()=>null) as {device?:unknown;visit?:unknown}|null;
  if(typeof body?.device!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.device))throw new StudioError('잘못된 방문 기록입니다.',400);
  const db=studioDB(env);await tables(db);
  // Only a hash of the random browser ID is stored; nothing ties it to a person or IP.
  const device=await hash('induo-visit:'+body.device),day=visitDay(time);
  const seen=await db.prepare('SELECT last_day FROM site_devices WHERE hash=?').bind(device).first<{last_day:string}>();
  await db.batch([
    db.prepare('INSERT INTO site_visit_days(day,views,visits,devices,new_devices) VALUES(?,1,?,?,?) ON CONFLICT(day) DO UPDATE SET views=views+1,visits=visits+excluded.visits,devices=devices+excluded.devices,new_devices=new_devices+excluded.new_devices')
      .bind(day,body.visit===true?1:0,seen?.last_day===day?0:1,seen?0:1),
    db.prepare('INSERT INTO site_devices(hash,first_day,last_day) VALUES(?,?,?) ON CONFLICT(hash) DO UPDATE SET last_day=excluded.last_day').bind(device,day,day),
  ]);
  return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
}

export async function visitStats(request:Request,env:VisitEnv,time=Date.now()){
  if(request.method!=='GET')throw new StudioError('GET 요청만 가능합니다.',405);
  if(!(await session(request,env)).host)throw new StudioError('호스트만 방문 통계를 볼 수 있습니다.',403);
  const db=studioDB(env);await tables(db);
  const since=visitDay(time-29*86400_000);
  const totals=await db.prepare('SELECT COALESCE(SUM(views),0) AS views, COALESCE(SUM(visits),0) AS visits FROM site_visit_days').first<{views:number;visits:number}>();
  const devices=await db.prepare('SELECT COUNT(*) AS devices FROM site_devices').first<{devices:number}>();
  const days=await db.prepare('SELECT day,views,visits,devices,new_devices AS newDevices FROM site_visit_days WHERE day>=? ORDER BY day DESC').bind(since).all();
  return json({today:visitDay(time),total:{views:totals?.views||0,visits:totals?.visits||0,devices:devices?.devices||0},days:days.results});
}
