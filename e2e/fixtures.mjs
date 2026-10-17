import {test as base,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {CONTENT_ORIGIN} from '../src/content-schema.mjs';

export {expect};
const contentRoot=resolve(import.meta.dirname,'../.content-dist');
const types={'.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg'};

// Every page runs offline: the content worker is served from the local `.content-dist` bundle
// (written by `npm run build`), other third-party hosts are aborted, and any page error,
// console error, CSP violation or failed same-origin asset fails the test.
export const test=base.extend({
  // 'local' serves the published-content bundle; 'offline' makes the content worker unreachable
  // so pages must fall back to their prerendered HTML.
  content:['local',{option:true}],
  // Regexes for problems a test deliberately provokes (e.g. a mocked 401 from /api/studio/session).
  expectedProblems:[[],{option:true}],
  page:async({page,content,expectedProblems},use)=>{
    const problems=[];
    page.on('pageerror',error=>problems.push('pageerror: '+error.message));
    page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource'))problems.push('console: '+message.text());});
    page.on('response',response=>{const url=new URL(response.url());if(url.hostname==='127.0.0.1'&&!url.pathname.startsWith('/api/')&&response.status()>=400&&response.request().resourceType()!=='document')problems.push('asset '+response.status()+': '+url.pathname);});
    await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>console.error('CSP violation: '+event.violatedDirective+' '+event.blockedURI)));
    await page.route(url=>url.hostname!=='127.0.0.1',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==CONTENT_ORIGIN||content==='offline')return route.abort();
      const body=await readFile(resolve(contentRoot,'.'+decodeURIComponent(url.pathname))).catch(()=>null);
      if(!body)return route.fulfill({status:404,headers:{'Access-Control-Allow-Origin':'*'},body:'not found'});
      return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Content-Type':types[extname(url.pathname)]||'application/octet-stream'},body});
    });
    await use(page);
    expect(problems.filter(problem=>!expectedProblems.some(pattern=>pattern.test(problem))),'page problems').toEqual([]);
  },
});

// Fails when anything makes the page wider than the viewport (the usual mobile layout regression).
export async function expectNoHorizontalOverflow(page){
  const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:document.documentElement.clientWidth,offenders:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>document.documentElement.clientWidth+1&&getComputedStyle(el).position!=='fixed';}).slice(0,5).map(el=>el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\s+/).slice(0,2).join('.'):''))}));
  expect(overflow.scroll,'horizontal overflow from '+overflow.offenders.join(', ')).toBeLessThanOrEqual(overflow.view);
}
