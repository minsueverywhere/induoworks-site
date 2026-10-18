import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createEditorStore, importEditorMedia, mediaFile, checkEditorContent } from './editor-store.mjs';
import { MAX_FILE_BYTES } from '../src/content-schema.mjs';
import {createDiscordReview} from './discord-review.mjs';
const exec=promisify(execFile);
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.avif':'image/avif','.gif':'image/gif','.ogg':'audio/ogg','.mp3':'audio/mpeg'};
export async function deployEditorContent(root,revision) {
  const store=createEditorStore(root);
  if((await store.read()).revision!==revision)throw Object.assign(new Error('저장본이 바뀌었습니다. 다시 불러와 주세요.'),{status:409});
  await checkEditorContent(root,(await store.read()).catalog);
  const options={cwd:root,env:{...process.env,CI:'true',WRANGLER_LOG_PATH:resolve(root,'.wrangler/logs/'),WRANGLER_SEND_METRICS:'false'},windowsHide:true,maxBuffer:2*1024*1024,timeout:180000};
  await exec(process.execPath,['scripts/content-prepare.mjs'],options);
  if((await store.read()).revision!==revision)throw Object.assign(new Error('배포 준비 중 저장본이 바뀌었습니다.'),{status:409});
  const result=await exec(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--config','content/wrangler.jsonc'],options);
  return result.stdout.slice(-10000);
}
export function createEditorMiddleware(root,{deploy=deployEditorContent,intakeQuery}={}) {
  const token=randomBytes(32).toString('hex'),store=createEditorStore(root);let busy=false;
  const intake=createDiscordReview(root,{deploy,query:intakeQuery});
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  return async(req,res,next)=>{
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    if(!path.startsWith('/__editor')&&!path.startsWith('/uploads/'))return next();
    const host=req.headers.host||'',address=req.socket.remoteAddress;
    if(!/^(?:127\.0\.0\.1|localhost):\d+$/.test(host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address))return json(res,403,{error:'로컬 컴퓨터에서만 사용할 수 있습니다.'});
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
    try {
      if(req.method==='GET') {
        if(path==='/__editor/intake-file'){
          if(req.headers['sec-fetch-site']!=='same-origin'&&!String(req.headers.referer||'').startsWith('http://'+host+'/'))return json(res,403,{error:'편집기에서 파일 미리보기를 열어주세요.'});
          const result=await intake.preview(new URL(req.url,'http://127.0.0.1').searchParams.get('id'));
          res.writeHead(200,{'Content-Type':result.mime,'Content-Length':result.bytes.length});return res.end(result.bytes);
        }
        if(path==='/__editor/catalog')return json(res,200,await store.read());
        if(path==='/__editor/preview')return json(res,200,await store.getPreview());
        let body,type;
        if(path==='/__editor/'||path==='/__editor'){body=(await readFile(new URL('./editor/index.html',import.meta.url),'utf8')).replace('__TOKEN__',token);type='text/html';}
        else if(['/__editor/editor.js','/__editor/editor.css','/__editor/history.mjs','/__editor/theme.js'].includes(path)){body=await readFile(new URL('./editor/'+path.split('/').pop(),import.meta.url));type=mime[extname(path)];}
        else if(path==='/__editor/placement.mjs'){body=await readFile(new URL('./editor-placement.mjs',import.meta.url));type='text/javascript';}
        else if(path.startsWith('/uploads/')){body=await readFile(await mediaFile(root,path));type=mime[extname(path)];}
        else return json(res,404,{error:'편집기 경로를 찾을 수 없습니다.'});
        res.writeHead(200,{'Content-Type':type+(type.startsWith('text/')?'; charset=utf-8':'')});return res.end(body);
      }
      if(req.method!=='POST'||req.headers.origin!=='http://'+host||req.headers['x-editor-token']!==token)return json(res,403,{error:'허용되지 않은 편집 요청입니다.'});
      if(busy)return json(res,409,{error:'다른 저장이나 배포가 진행 중입니다.'});
      busy=true;
      try {
        let size=0;const chunks=[];const limit=path==='/__editor/upload'?MAX_FILE_BYTES:1024*1024;
        for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(new Error('파일 또는 목록 크기 제한을 초과했습니다.'),{status:413});chunks.push(chunk);}
        const body=Buffer.concat(chunks);
        if(path==='/__editor/upload')return json(res,200,await importEditorMedia(root,decodeURIComponent(req.headers['x-file-name']||''),body));
        const payload=JSON.parse(body.toString('utf8'));
        if(path==='/__editor/intake-list')return json(res,200,{items:await intake.list()});
        if(path==='/__editor/intake-reject')return json(res,200,await intake.reject(payload.id));
        if(path==='/__editor/intake-approve')return json(res,200,await intake.approve(payload));
        if(path==='/__editor/intake-confirm')return json(res,200,await intake.confirm(payload.id));
        if(path==='/__editor/preview'){await store.preview(payload.catalog);return json(res,200,{ok:true});}
        if(path==='/__editor/save')return json(res,200,await store.save(payload.catalog,payload.revision));
        if(path==='/__editor/deploy'){
          if((await store.read()).revision!==payload.revision)throw Object.assign(new Error('저장본이 바뀌었습니다. 다시 불러와 주세요.'),{status:409});
          return json(res,200,{log:await deploy(root,payload.revision)});
        }
        return json(res,404,{error:'지원하지 않는 편집 작업입니다.'});
      } finally {busy=false;}
    } catch(error){return json(res,error.status||400,{error:error.message});}
  };
}
export function localEditorPlugin() {
  return {name:'induo-local-editor',apply:'serve',
    configureServer(server){server.middlewares.use(createEditorMiddleware(process.cwd()));},
    async transform(code,id){
      if(!id.replaceAll('\\','/').split('?')[0].endsWith('/src/scripts/village.js'))return;
      this.addWatchFile?.(fileURLToPath(new URL('./editor/bridge.js',import.meta.url)));
      code=code.replace('let remoteContent=await loadContent();',"let remoteContent=['localhost','127.0.0.1','[::1]'].includes(location.hostname)?await fetch('/__editor/preview?t='+Date.now(),{cache:'no-store'}).then(r=>r.json()):await loadContent();");
      code=code.replace('for (const object of objects) {','drawEditorOverlay(layer.index); for (const object of objects) { if(object.editorHidden)continue;');
      code=code.replace('area=next;updateFloors();',"area=next;updateFloors();sendEditor({type:'area',owner:area==='room'?activeWorker.id:null,level:roomLevel});");
      code=code.replace('sprites.clear();updateFloors();requestDraw();',"sprites.clear();updateFloors();requestDraw();sendEditor({type:'area',owner:activeWorker.id,level:roomLevel});");
      const bridge=await readFile(new URL('./editor/bridge.js',import.meta.url),'utf8'),imports=bridge.split('\n').filter(line=>line.startsWith('import ')).join('\n'),body=bridge.split('\n').filter(line=>!line.startsWith('import ')).join('\n');
      return {code:imports+'\n'+code.replace('// VILLAGE_EDITOR_BRIDGE',body),map:null};
    },
  };
}
