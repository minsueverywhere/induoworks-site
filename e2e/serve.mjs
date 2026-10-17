// Serves the prerendered build the way Cloudflare's asset layer does for these pages:
// _headers (including the generated CSP), _redirects, directory indexes and 404.html.
// The Worker routes (/api/*) are not served; tests mock them per page.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';

const root=resolve(import.meta.dirname,'../dist/client'),port=Number(process.env.E2E_PORT||4329);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon','.xml':'application/xml','.txt':'text/plain','.woff2':'font/woff2','.ogg':'audio/ogg','.mp3':'audio/mpeg','.webmanifest':'application/manifest+json'};
const pattern=path=>new RegExp('^'+path.split('*').map(part=>part.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$');
function parseHeaders(text){
  const rules=[];let rule;
  for(const line of text.split('\n')){
    if(!line.trim()||line.trim().startsWith('#'))continue;
    if(!/^\s/.test(line)){rule={match:pattern(line.trim()),headers:[]};rules.push(rule);continue;}
    const at=line.indexOf(':');if(rule&&at>0)rule.headers.push([line.slice(0,at).trim(),line.slice(at+1).trim()]);
  }
  return rules;
}
const headerRules=parseHeaders(await readFile(resolve(root,'_headers'),'utf8'));
const redirects=(await readFile(resolve(root,'_redirects'),'utf8').catch(()=>'')).split('\n').map(l=>l.trim().split(/\s+/)).filter(p=>p.length>=2&&!p[0].startsWith('#'));
async function file(path){
  const full=resolve(root,'.'+decodeURIComponent(path));
  if(full!==root&&!full.startsWith(root+sep))return null;
  const info=await stat(full).catch(()=>null);
  if(info?.isFile())return full;
  if(info?.isDirectory()){const index=resolve(full,'index.html');if(await stat(index).catch(()=>null))return index;}
  return null;
}
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),path=url.pathname;
    const redirect=redirects.find(([from])=>from===path);
    if(redirect){res.writeHead(Number(redirect[2]||302),{Location:redirect[1]});return res.end();}
    let target=await file(path),status=200;
    if(target&&!path.endsWith('/')&&target.endsWith(sep+'index.html')&&!path.endsWith('index.html')){res.writeHead(308,{Location:path+'/'+url.search});return res.end();}
    if(!target){target=resolve(root,'404.html');status=404;}
    const headers={'Content-Type':types[extname(target)]||'application/octet-stream'};
    for(const rule of headerRules)if(rule.match.test(path))for(const [name,value] of rule.headers)headers[name]=value;
    delete headers['Strict-Transport-Security'];
    res.writeHead(status,headers);res.end(req.method==='HEAD'?undefined:await readFile(target));
  }catch(error){res.writeHead(500);res.end(String(error));}
}).listen(port,'127.0.0.1',()=>console.log('e2e static server http://127.0.0.1:'+port));
