import type {APIRoute} from 'astro';
import {env} from 'cloudflare:workers';
import {StudioError,discordLogin,discordCallback,logout,session,json,type StudioEnv} from '../../../server/studio-auth.ts';
import {studioDrafts} from '../../../server/studio-drafts.ts';
export const prerender=false;
export const ALL:APIRoute=async({request,params})=>{
  const bindings=env as unknown as StudioEnv;
  try{
    if(request.method==='GET'&&params.action==='login')return await discordLogin(request,bindings);
    if(request.method==='GET'&&params.action==='callback')return await discordCallback(request,bindings);
    if(request.method==='GET'&&params.action==='session')return json(await session(request,bindings));
    if(request.method==='POST'&&params.action==='logout')return await logout(request,bindings);
    if(['draft','submit','proposals','proposal','reject','published'].includes(params.action||''))return await studioDrafts(request,bindings,params.action!);
    return json({error:'찾을 수 없는 참여자 기능입니다.'},404);
  }catch(error){return json({error:error instanceof StudioError?error.message:'참여자 서비스를 처리하지 못했습니다.'},error instanceof StudioError?error.status:503);}
};
