import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {INTAKE_FILE_BYTES,validateMediaFile} from '../src/media-file.mjs';
import {CONTENT_ORIGIN,validateCatalog} from '../src/content-schema.mjs';
import {createEditorStore,importEditorMedia,checkEditorContent} from './editor-store.mjs';
const exec=promisify(execFile),ID=/^\d{17,22}$/;
export function remoteIntakeQuery(root){return async sql=>{
  let stdout;try{({stdout}=await exec(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','STUDIO_DB','--remote','--config','wrangler.jsonc','--command',sql,'--json'],{cwd:root,windowsHide:true,maxBuffer:40*1024*1024,timeout:60000,env:{...process.env,WRANGLER_LOG_PATH:resolve(root,'.wrangler/logs/'),WRANGLER_SEND_METRICS:'false'}}));}catch{throw Error('Discord 접수 저장소를 읽지 못했습니다. Cloudflare 로그인과 DB 마이그레이션 상태를 확인해 주세요.');}
  const result=JSON.parse(stdout);if(!Array.isArray(result)||result.some(r=>!r.success))throw Error('Discord 접수 저장소 조회에 실패했습니다.');return result.flatMap(r=>r.results||[]);
};}
export function importedWork(catalog,row,media,duration){
  const next=structuredClone(catalog),owner=next.workers.find(w=>w.id===row.worker_id);
  if(!owner?.house)throw Error('집이 있는 업체를 먼저 등록해 주세요.');
  const id='discord-'+row.id;
  if([...next.media,...(next.tracks||[])].some(item=>item.id===id))throw Error('이미 가져온 접수입니다. 발행 확인을 사용해 주세요.');
  if(row.kind==='image')next.media.push({id,title:{ko:row.title,en:row.title},description:{ko:row.description,en:row.description},workerIds:[owner.id],tags:[],original:media.original,preview:media.preview,badge:media.badge,width:media.width,height:media.height,bytes:media.bytes});
  else{
    if(!Number.isFinite(duration)||duration<=0||duration>86400)throw Error('음원 미리보기를 열어 실제 재생 길이를 확인해 주세요.');
    (next.tracks??=[]).push({id,title:row.title,project:row.description,artist:owner.name,workerIds:[owner.id],duration,sourceSha256:row.sha256,sources:{[row.filename.split('.').pop()]:media.original}});
  }
  return validateCatalog(next);
}
export function publishedWork(catalog,row){
  const record=(row.kind==='image'?catalog.media:catalog.tracks||[]).find(item=>item.id==='discord-'+row.id),path='/uploads/'+row.sha256.slice(0,20)+'.'+row.filename.split('.').pop();
  return record?.workerIds?.length===1&&record.workerIds[0]===row.worker_id&&
    (row.kind==='image'?record.original===path&&record.bytes===row.size:record.sourceSha256===row.sha256&&Object.values(record.sources).includes(path));
}
export function createDiscordReview(root,{query=remoteIntakeQuery(root),deploy,fetcher=fetch}={}){
  const store=createEditorStore(root),directory=resolve(root,'.wrangler/intake-cache');
  const id=value=>{if(!ID.test(value||''))throw Error('접수 ID가 올바르지 않습니다.');return value;};
  async function rowFor(value){const rows=await query("SELECT * FROM studio_uploads WHERE id='"+id(value)+"'");if(!rows[0])throw Error('접수를 찾을 수 없습니다.');return rows[0];}
  async function bytesFor(row){
    if(!['pending','publishing'].includes(row.status)||row.status==='pending'&&row.expires<=Date.now())throw Error('접수가 만료되었거나 이미 처리되었습니다.');
    let bytes=await readFile(resolve(directory,row.id)).catch(()=>null);
    if(!bytes){const chunks=await query("SELECT part,hex(bytes) AS hex FROM studio_upload_chunks WHERE upload_id='"+id(row.id)+"' ORDER BY part");if(chunks.some((c,i)=>c.part!==i))throw Error('파일 조각이 누락되었습니다.');bytes=Buffer.concat(chunks.map(c=>Buffer.from(c.hex,'hex')));}
    if(bytes.length!==row.size||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('파일의 크기 또는 해시가 다릅니다.');
    validateMediaFile(row.filename,bytes,INTAKE_FILE_BYTES);await mkdir(directory,{recursive:true});await writeFile(resolve(directory,row.id),bytes);return bytes;
  }
  async function confirm(value){
    const row=await rowFor(value);if(row.status!=='publishing')throw Error('발행 대기 중인 접수만 확인할 수 있습니다.');
    const response=await fetcher(CONTENT_ORIGIN+'/catalog.json?intake='+row.id+'&t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('공개 승인본 조회에 실패했습니다.');
    const catalog=validateCatalog(await response.json());if(!publishedWork(catalog,row))throw Error('아직 공개 콘텐츠에 없습니다. 저장본·배포 결과를 확인한 뒤 발행 확인을 다시 눌러주세요.');
    await query("UPDATE studio_uploads SET status='published' WHERE id='"+row.id+"' AND status='publishing'; DELETE FROM studio_upload_chunks WHERE upload_id='"+row.id+"' AND EXISTS(SELECT 1 FROM studio_uploads WHERE id='"+row.id+"' AND status='published');");return {ok:true};
  }
  return {
    async list(){
      const now=Date.now();await query("DELETE FROM studio_upload_chunks WHERE upload_id IN (SELECT id FROM studio_uploads WHERE expires<="+now+" AND status IN ('receiving','pending')); UPDATE studio_uploads SET status='expired' WHERE expires<="+now+" AND status IN ('receiving','pending');");
      const items=await query("SELECT id,worker_id,title,description,filename,size,kind,status,created,expires FROM studio_uploads WHERE status IN ('pending','publishing') ORDER BY created LIMIT 100");
      for(const name of await readdir(directory).catch(()=>[]))if(ID.test(name)&&!items.some(item=>item.id===name))await unlink(resolve(directory,name)).catch(()=>{});
      return items;
    },
    async preview(value){const row=await rowFor(value),bytes=await bytesFor(row);return {row,bytes,mime:validateMediaFile(row.filename,bytes).mime};},
    async reject(value){const row=await rowFor(value);if(row.status!=='pending')throw Error('검토 대기 중인 접수만 반려할 수 있습니다.');const changed=await query("UPDATE studio_uploads SET status='rejected' WHERE id='"+row.id+"' AND status='pending' RETURNING id");if(!changed.length)throw Error('다른 창에서 처리했습니다.');await query("DELETE FROM studio_upload_chunks WHERE upload_id='"+row.id+"' AND EXISTS(SELECT 1 FROM studio_uploads WHERE id='"+row.id+"' AND status='rejected')");return {ok:true};},
    async approve({id:value,revision,duration}){
      const before=await store.read();if(before.revision!==revision)throw Error('저장본이 바뀌었습니다. 다시 불러와 주세요.');
      const row=await rowFor(value);if(row.status!=='pending')throw Error('이미 처리 중인 접수입니다. 발행 확인을 사용해 주세요.');
      const authorized=await query("SELECT user_id FROM studio_members WHERE user_id='"+id(row.user_id)+"' AND worker_id='"+row.worker_id.replaceAll("'","''")+"' UNION SELECT user_id FROM studio_hosts WHERE user_id='"+row.user_id+"'");if(!authorized.length)throw Error('제출자의 업체 권한이 해제되었습니다.');
      const bytes=await bytesFor(row),media=await importEditorMedia(root,row.filename,bytes),next=importedWork(before.catalog,row,media,duration);await checkEditorContent(root,next);
      const claimed=await query("UPDATE studio_uploads SET status='publishing' WHERE id='"+row.id+"' AND status='pending' AND expires>"+Date.now()+" RETURNING id");if(!claimed.length)throw Error('다른 창에서 처리했거나 만료되었습니다.');
      let saved;
      try{saved=await store.save(next,revision);}catch(error){await query("UPDATE studio_uploads SET status='pending' WHERE id='"+row.id+"' AND status='publishing'");throw error;}
      // shortcut: publishing is driven by the host's local editor; move to a dedicated publisher if the host must approve without a PC.
      try{const log=await deploy(root,saved.revision);await confirm(row.id);return {ok:true,log};}
      catch{throw Error('승인본은 로컬에 저장됐습니다. 배포 결과가 확정되지 않아 자동 재시도하지 않습니다. 다시 불러온 뒤 콘텐츠 배포·발행 확인으로 이어가세요.');}
    },
    confirm,
  };
}
