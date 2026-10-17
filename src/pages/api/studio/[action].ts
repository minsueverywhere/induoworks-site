import type {APIRoute} from 'astro';
import {env} from 'cloudflare:workers';
import {StudioError,discordLogin,discordCallback,logout,session,rateLimit,json,workerProfiles,type StudioEnv} from '../../../server/studio-auth.ts';
import {studioDrafts} from '../../../server/studio-drafts.ts';
import {studioRooms} from '../../../server/studio-rooms.ts';
import {studioVillage} from '../../../server/studio-village.ts';
import {studioGuestbook} from '../../../server/studio-guestbook.ts';
export const prerender=false;
export const ALL:APIRoute=async({request,params})=>{
  const bindings=env as unknown as StudioEnv;
  try{
    if(params.action==='worker-profiles')return await workerProfiles(request,bindings,await caches.open('studio-public-worker-profiles'));
    if(['village','village-view'].includes(params.action||''))return await studioVillage(request,bindings,params.action!,params.action==='village-view'?await caches.open('studio-public-village'):undefined);
    if(params.action==='guestbook')return await studioGuestbook(request,bindings);
    if(['room','room-view'].includes(params.action||''))return await studioRooms(request,bindings,params.action!,params.action==='room-view'?await caches.open('studio-public-rooms'):undefined);
    if(request.method==='GET'&&params.action==='login')return await discordLogin(request,bindings);
    if(request.method==='GET'&&params.action==='callback')return await discordCallback(request,bindings);
    if(request.method==='GET'&&params.action==='session'){await rateLimit(request,bindings);return json(await session(request,bindings));}
    if(request.method==='POST'&&params.action==='logout')return await logout(request,bindings);
    if(['draft','submit','proposals','proposal','reject','published'].includes(params.action||''))return await studioDrafts(request,bindings,params.action!);
    return json({error:'찾을 수 없는 참여자 기능입니다.'},404);
  }catch(error){
    if(params.action==='callback')return new Response(null,{status:303,headers:{Location:'https://induo.works/ko/?studio=1&authError=1','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    return json({error:error instanceof StudioError?error.message:'참여자 서비스를 처리하지 못했습니다.'},error instanceof StudioError?error.status:503);
  }
};
