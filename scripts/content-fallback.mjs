import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const from=resolve(import.meta.dirname,'../.content-dist'),to=resolve(import.meta.dirname,'../dist/client');
for(const name of await readdir(from,{recursive:true,withFileTypes:true})) {
  if(!name.isFile() || ['catalog.json','_headers'].includes(name.name))continue;
  const source=resolve(name.parentPath,name.name),relative=source.slice(from.length+1),target=resolve(to,relative);
  await mkdir(dirname(target),{recursive:true});await copyFile(source,target);
}
