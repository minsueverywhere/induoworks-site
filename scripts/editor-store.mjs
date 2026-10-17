import { readFile, writeFile, mkdir, rename, stat, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname, relative, extname } from 'node:path';
import sharp from 'sharp';
import { validateCatalog, mediaPaths } from '../src/content-schema.mjs';
import { validateMediaFile } from './content-files.mjs';
import { placementError } from './editor-placement.mjs';
export { placementError } from './editor-placement.mjs';

export const revisionOf=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function mediaFile(root,path) {
  if(!/^\/(?:uploads|village\/media|village\/music|work\/media)\/[a-z0-9-]+\.(?:webp|png|jpe?g|avif|gif|ogg|mp3)$/.test(path))throw new Error('허용되지 않은 파일 경로입니다.');
  for(const base of [resolve(root,'content/files'),resolve(root,'public')]) {
    const file=resolve(base,path.slice(1));
    if(!await stat(file).catch(()=>null))continue;
    const actual=await realpath(file),actualBase=await realpath(base);
    if(relative(actualBase,actual).startsWith('..'))throw new Error('콘텐츠 폴더 바깥의 파일은 사용할 수 없습니다.');
    return actual;
  }
  throw new Error('파일을 찾을 수 없습니다: '+path);
}
export async function checkEditorContent(root,data) {
  validateCatalog(data);
  const nonempty=value=>typeof value==='string'&&value.trim().length>0;
  if(!data.workers.every(w=>nonempty(w.name)&&nonempty(w.description.ko)&&nonempty(w.description.en))||
    ![...data.projects,...data.media].every(w=>nonempty(w.title.ko)&&nonempty(w.title.en))||
    ![data.music,...(data.tracks||[])].every(t=>nonempty(t.title)&&nonempty(t.project)))throw new Error('이름·제목과 업체 소개, 음악의 작품·아티스트를 입력해 주세요.');
  for(const w of data.workers)if(w.house) {
    const error=placementError(data.workers,w.id,w.house);if(error)throw new Error(w.name+': '+error);
    if(data.projects.filter(p=>p.workerIds?.includes(w.id)).length>9)throw new Error(w.name+': 작업실에는 작품을 최대 9개까지 놓을 수 있습니다.');
    if(data.media.filter(m=>m.workerIds.includes(w.id)).length>4)throw new Error(w.name+': 현재 작업실의 이미지 전시는 최대 4개입니다.');
  }
  for(const path of mediaPaths(data))validateMediaFile(path,await readFile(await mediaFile(root,path)));
  return data;
}
export function createEditorStore(root) {
  const path=resolve(root,'content/catalog.json');
  let preview;
  return {
    async read() {const bytes=await readFile(path);return {catalog:JSON.parse(bytes),revision:revisionOf(bytes)};},
    async preview(data) {preview=await checkEditorContent(root,data);},
    async getPreview() {return preview||JSON.parse(await readFile(path,'utf8'));},
    async save(data,revision) {
      await checkEditorContent(root,data);
      const before=await readFile(path);
      if(revision!==revisionOf(before))throw Object.assign(new Error('다른 창이나 도구에서 수정했습니다. 최신 내용을 다시 불러와 주세요.'),{status:409});
      const backup=resolve(root,'.wrangler/editor-backups',Date.now()+'-'+revision.slice(0,12)+'.json');
      await mkdir(dirname(backup),{recursive:true});await writeFile(backup,before,{flag:'wx'});
      const bytes=JSON.stringify(data,null,2)+'\n',temp=path+'.'+randomUUID()+'.tmp';
      await writeFile(temp,bytes,{flag:'wx'});
      if(revisionOf(await readFile(path))!==revision)throw Object.assign(new Error('저장 중 원본이 바뀌었습니다. 다시 불러와 주세요.'),{status:409});
      await rename(temp,path);preview=data;
      return {revision:revisionOf(bytes),backup:relative(root,backup)};
    },
  };
}
export async function importEditorMedia(root,name,bytes) {
  validateMediaFile(name,bytes);
  const stem=revisionOf(bytes).slice(0,20),extension=extname(name).toLowerCase(),directory=resolve(root,'content/files/uploads');
  await mkdir(directory,{recursive:true});
  const put=async(filename,body)=>{await writeFile(resolve(directory,filename),body,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});return '/uploads/'+filename;};
  const original=await put(stem+extension,bytes);
  if(['.ogg','.mp3'].includes(extension))return {original,bytes:bytes.length,sha256:revisionOf(bytes)};
  const image=sharp(bytes,{limitInputPixels:40000000}).rotate(),metadata=await image.metadata();
  const preview=await put(stem+'-preview.webp',await image.clone().resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer());
  const badge=await put(stem+'-badge.webp',await image.clone().resize({width:96,height:96,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer());
  const small=await sharp(await readFile(resolve(directory,stem+'-preview.webp'))).metadata();
  return {original,preview,badge,bytes:bytes.length,width:metadata.autoOrient?.width||metadata.width,height:metadata.autoOrient?.height||metadata.height,previewWidth:small.width,previewHeight:small.height};
}
