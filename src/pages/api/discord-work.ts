import type {APIRoute} from 'astro';
import {env,waitUntil} from 'cloudflare:workers';
import {discordIntake} from '../../server/discord-intake.mjs';
export const prerender=false;
export const ALL:APIRoute=async({request})=>{
  try{return await discordIntake(request,env,waitUntil);}
  catch{return new Response('Could not accept submission',{status:400});}
};
