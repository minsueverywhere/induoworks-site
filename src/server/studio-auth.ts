export interface StudioEnv {
  STUDIO_DB?: D1Database;
  STUDIO_RATE_LIMITER?: {limit(options:{key:string}):Promise<{success:boolean}>};
  DISCORD_CLIENT_ID?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
}
export class StudioError extends Error {
  status:number;
  constructor(message:string,status=400){super(message);this.status=status;}
}
export const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
const nonce=()=>crypto.randomUUID()+crypto.randomUUID();
const now=()=>Math.floor(Date.now()/1000);
const cookie=(name:string,value:string,seconds:number)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
const readCookie=(request:Request,name:string)=>request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';
export const studioDB=(env:StudioEnv)=>{if(!env.STUDIO_DB)throw new StudioError('참여자 편집 서비스가 아직 설정되지 않았습니다.',503);return env.STUDIO_DB;};
export async function rateLimit(request:Request,env:StudioEnv){
  if(!env.STUDIO_RATE_LIMITER)throw new StudioError('참여자 요청 제한이 설정되지 않았습니다.',503);
  if(!(await env.STUDIO_RATE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)throw new StudioError('잠시 뒤 다시 시도해 주세요.',429);
}
export function sameOrigin(request:Request){
  if(request.headers.get('Origin')!=='https://induo.works')throw new StudioError('허용되지 않은 요청입니다.',403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new StudioError('JSON 형식으로 보내주세요.',415);
}
export async function session(request:Request,env:StudioEnv){
  const db=studioDB(env),token=readCookie(request,'__Host-induo-session');
  if(!/^[a-f0-9-]{72}$/.test(token))throw new StudioError('Discord 로그인이 필요합니다.',401);
  const user=await db.prepare('SELECT user_id, name FROM studio_sessions WHERE hash=? AND expires>?').bind(await hash(token),now()).first<{user_id:string;name:string}>();
  if(!user)throw new StudioError('로그인이 만료되었습니다.',401);
  const owners=await db.prepare('SELECT worker_id FROM studio_members WHERE user_id=?').bind(user.user_id).all<{worker_id:string}>();
  const host=await db.prepare('SELECT user_id FROM studio_hosts WHERE user_id=?').bind(user.user_id).first();
  return {id:user.user_id,name:user.name,owners:owners.results.map(row=>row.worker_id),host:!!host};
}
export async function authorize(request:Request,env:StudioEnv,owner:string){
  const user=await session(request,env);
  if(!user.owners.includes(owner)&&!user.host)throw new StudioError('이 작업실을 편집할 권한이 없습니다.',403);
  return user;
}
export async function discordLogin(request:Request,env:StudioEnv){
  await rateLimit(request,env);const db=studioDB(env);
  if(!env.DISCORD_CLIENT_ID||!env.DISCORD_CLIENT_SECRET||!env.DISCORD_GUILD_ID)throw new StudioError('Discord 로그인이 아직 설정되지 않았습니다.',503);
  const state=nonce();await db.batch([db.prepare('DELETE FROM studio_oauth_states WHERE expires<?').bind(now()),db.prepare('INSERT INTO studio_oauth_states(hash,expires) VALUES(?,?)').bind(await hash(state),now()+600)]);
  const url=new URL('https://discord.com/oauth2/authorize');url.search=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,response_type:'code',scope:'identify guilds.members.read',redirect_uri:'https://induo.works/api/studio/callback',state}).toString();
  return new Response(null,{status:302,headers:{Location:url.href,'Cache-Control':'no-store','Set-Cookie':cookie('__Host-induo-oauth',state,600),'Referrer-Policy':'no-referrer'}});
}
export async function discordCallback(request:Request,env:StudioEnv,fetcher:typeof fetch=fetch){
  await rateLimit(request,env);const db=studioDB(env),url=new URL(request.url),state=url.searchParams.get('state')||'';
  if(!env.DISCORD_CLIENT_ID||!env.DISCORD_CLIENT_SECRET||!env.DISCORD_GUILD_ID)throw new StudioError('Discord 로그인이 아직 설정되지 않았습니다.',503);
  if(!/^[a-f0-9-]{72}$/.test(state)||readCookie(request,'__Host-induo-oauth')!==state||url.searchParams.get('iss')&&url.searchParams.get('iss')!=='https://discord.com')throw new StudioError('로그인 확인 정보가 맞지 않습니다. 다시 시작해 주세요.',400);
  const once=await db.prepare('DELETE FROM studio_oauth_states WHERE hash=? AND expires>? RETURNING hash').bind(await hash(state),now()).first();
  if(!once||!url.searchParams.get('code')||url.searchParams.has('error'))throw new StudioError('로그인이 취소되었거나 만료되었습니다.',400);
  const response=await fetcher('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code:url.searchParams.get('code')!,redirect_uri:'https://induo.works/api/studio/callback'}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new StudioError('Discord 로그인을 완료하지 못했습니다.',502);
  const token=await response.json() as {access_token?:string;scope?:string};
  if(!token.access_token||!['identify','guilds.members.read'].every(scope=>token.scope?.split(' ').includes(scope)))throw new StudioError('Discord 계정 확인 권한이 없습니다.',403);
  const profile=await fetcher('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(10000)});
  if(!profile.ok)throw new StudioError('Discord 계정을 확인하지 못했습니다.',502);
  const user=await profile.json() as {id?:string;username?:string;global_name?:string};
  if(!user.id||!/^\d{15,22}$/.test(user.id))throw new StudioError('Discord 계정 정보가 올바르지 않습니다.',502);
  const member=await fetcher('https://discord.com/api/v10/users/@me/guilds/'+env.DISCORD_GUILD_ID+'/member',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(10000)});
  if(!member.ok&&member.status!==404)throw new StudioError('서버 닉네임을 확인하지 못했습니다. 다시 로그인해 주세요.',502);
  const nick=member.ok?(await member.json() as {nick?:string|null}).nick:null;
  const name=(nick||user.global_name||user.username||'Participant').slice(0,100);
  await db.prepare('UPDATE studio_worker_profiles SET display_name=?, updated=? WHERE user_id=? AND EXISTS (SELECT 1 FROM studio_members WHERE worker_id=studio_worker_profiles.worker_id AND user_id=?) AND (SELECT COUNT(*) FROM studio_members WHERE worker_id=studio_worker_profiles.worker_id)=1').bind(name,Date.now(),user.id,user.id).run();
  const value=nonce();await db.batch([db.prepare('DELETE FROM studio_sessions WHERE expires<?').bind(now()),db.prepare('INSERT INTO studio_sessions(hash,user_id,name,expires) VALUES(?,?,?,?)').bind(await hash(value),user.id,name,now()+604800)]);
  const headers=new Headers({Location:'/ko/?studio=1','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  headers.append('Set-Cookie',cookie('__Host-induo-session',value,604800));headers.append('Set-Cookie',cookie('__Host-induo-oauth','',0));
  return new Response(null,{status:303,headers});
}
export async function workerProfiles(request:Request,env:StudioEnv,cache?:Cache){
  if(request.method!=='GET')throw new StudioError('GET 요청만 가능합니다.',405);
  const key=new Request('https://induo.works/api/studio/worker-profiles'),cached=await cache?.match(key);if(cached)return cached;
  const rows=await studioDB(env).prepare('SELECT p.worker_id AS id,p.display_name AS name FROM studio_worker_profiles p WHERE EXISTS (SELECT 1 FROM studio_members m WHERE m.worker_id=p.worker_id AND m.user_id=p.user_id) AND (SELECT COUNT(*) FROM studio_members m WHERE m.worker_id=p.worker_id)=1 LIMIT 1000').bind().all<{id:string;name:string}>();
  const response=Response.json(rows.results,{headers:{'Cache-Control':'public, max-age=0, s-maxage=60','X-Content-Type-Options':'nosniff'}});
  await cache?.put(key,response.clone());return response;
}
export async function logout(request:Request,env:StudioEnv){
  sameOrigin(request);await rateLimit(request,env);await studioDB(env).prepare('DELETE FROM studio_sessions WHERE hash=?').bind(await hash(readCookie(request,'__Host-induo-session'))).run();
  const response=json({ok:true});response.headers.set('Set-Cookie',cookie('__Host-induo-session','',0));return response;
}
