import { readFile, writeFile, mkdir, copyFile, stat, readdir } from 'node:fs/promises';
import { resolve, dirname, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { validateCatalog, mediaPaths, MAX_FILES, CONTENT_ORIGIN } from '../src/content-schema.mjs';
import { validateMediaFile } from './content-files.mjs';

const root=resolve(import.meta.dirname,'..'), out=resolve(root,'.content-dist');
const data=validateCatalog(JSON.parse(await readFile(resolve(root,'content/catalog.json'),'utf8')));
if (process.argv[2]==='import') {
  const source=process.argv[3];
  if (!source) throw new Error('Usage: npm run content:import -- path/to/file.ogg');
  if ((await stat(source)).size>25*1024*1024) throw new Error('Media exceeds 25 MiB');
  const bytes=await readFile(source);validateMediaFile(source,bytes);
  const name=createHash('sha256').update(bytes).digest('hex').slice(0,20)+extname(source).toLowerCase();
  const dest=resolve(root,'content/files/uploads',name);
  await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  console.log('Imported /uploads/'+name+' ('+bytes.length+' bytes). Add this URL to content/catalog.json.');
} else {
  await mkdir(out,{recursive:true});
  // Keep previous hashed files: open pages and older catalog caches may still reference them.
  for (const path of mediaPaths(data)) {
    if (!path.startsWith('/')) throw new Error('Publish local media, not remote dependencies: '+path);
    if (path.split('/').includes('..') || decodeURIComponent(path)!==path) throw new Error('Invalid media path');
    let source=resolve(root,'content/files',path.slice(1));
    if (!await stat(source).catch(()=>null)) source=resolve(root,'public',path.slice(1));
    const bytes=await readFile(source);validateMediaFile(source,bytes);
    const dest=resolve(out,path.slice(1));
    if (relative(out,dest).startsWith('..')) throw new Error('Media outside content bundle');
    await mkdir(dirname(dest),{recursive:true});await copyFile(source,dest);
  }
  await writeFile(resolve(out,'catalog.json'),JSON.stringify(data));
  await writeFile(resolve(out,'_headers'),`/*\n  Access-Control-Allow-Origin: *\n  X-Content-Type-Options: nosniff\n/village/*\n  Cache-Control: public, max-age=31536000, immutable\n/work/media/*\n  Cache-Control: public, max-age=31536000, immutable\n/uploads/*\n  Cache-Control: public, max-age=31536000, immutable\n/catalog.json\n  Cache-Control: public, max-age=60, must-revalidate\n`);
  const files=await readdir(out,{recursive:true,withFileTypes:true});
  if (files.filter(f=>f.isFile()).length>MAX_FILES) throw new Error('Content bundle exceeds 20,000 files');
  console.log('Content ready: '+mediaPaths(data).length+' media files; '+CONTENT_ORIGIN+'/catalog.json');
}
