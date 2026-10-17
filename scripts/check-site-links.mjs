import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { mediaPaths, validateCatalog } from '../src/content-schema.mjs';

const root=resolve(import.meta.dirname,'../dist/client');
const paths=new Set();
const decode=value=>value.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
for(const name of await readdir(root,{recursive:true})) {
  if(!name.endsWith('.html'))continue;
  const html=await readFile(resolve(root,name),'utf8');
  const base=new URL(name.replaceAll('\\','/').replace(/index\.html$/,''),'https://induo.works/');
  for(const match of html.matchAll(/\b(?:href|src|data-src)="([^"]+)"/g)) {
    const url=new URL(decode(match[1]),base);
    if(url.origin==='https://induo.works' && !url.pathname.startsWith('/api/'))paths.add(decodeURIComponent(url.pathname));
  }
}
const catalog=validateCatalog(JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8')));
for(const path of mediaPaths(catalog))if(path.startsWith('/'))paths.add(path);
const missing=[];
for(const path of paths) {
  const target=resolve(root,path.slice(1));
  if(relative(root,target).startsWith('..'))throw new Error('URL escapes build');
  const file=path.endsWith('/')?resolve(target,'index.html'):target;
  if(!(await stat(file).catch(()=>null))?.isFile())missing.push(path);
}
if(missing.length)throw new Error('Broken local references: '+missing.join(', '));
console.log('Verified '+paths.size+' internal page and asset paths.');
if(process.argv.includes('--live')) {
  const failures=[];
  for(let i=0;i<paths.size;i+=6) {
    await Promise.all([...paths].slice(i,i+6).map(async path=>{
      const response=await fetch('https://induo.works'+path,{method:'HEAD',signal:AbortSignal.timeout(15000)});
      if(!response.ok)failures.push(path+' '+response.status);
    }));
  }
  if(failures.length)throw new Error('Live failures: '+failures.join(', '));
  console.log('All '+paths.size+' live paths returned successful responses.');
}
