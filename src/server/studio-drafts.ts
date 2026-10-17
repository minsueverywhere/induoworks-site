import {CONTENT_ORIGIN,validateCatalog} from '../content-schema.mjs';
import {studioSlice,mergeStudio} from './studio-content.mjs';
import {authorize,session,studioDB,sameOrigin,hash,json,rateLimit,StudioError,type StudioEnv} from './studio-auth.ts';
async function catalog(){
  const response=await fetch(CONTENT_ORIGIN+'/catalog.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new StudioError('공개 승인본을 읽지 못했습니다.',503);
  const body=await response.text();if(body.length>1024*1024)throw new StudioError('콘텐츠 한도를 초과했습니다.',503);
  return validateCatalog(JSON.parse(body));
}
async function body(request:Request){
  const reader=request.body?.getReader();if(!reader)throw new StudioError('작성 내용이 없습니다.');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>256*1024){await reader.cancel();throw new StudioError('변경안은 256KiB 이하여야 합니다.',413);}chunks.push(value);}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(data));}catch{throw new StudioError('JSON 형식이 올바르지 않습니다.');}
}
export async function studioDrafts(request:Request,env:StudioEnv,action:string){
  await rateLimit(request,env);const db=studioDB(env);
  if(request.method==='POST')sameOrigin(request);
  if(request.method==='GET'&&action==='proposals'){
    const user=await session(request,env);if(!user.host)throw new StudioError('호스트만 검토할 수 있습니다.',403);
    return json((await db.prepare('SELECT id,worker_id,reason,status,created FROM studio_proposals WHERE status=? ORDER BY created DESC LIMIT 100').bind('pending').all()).results);
  }
  if(['proposal','reject','published'].includes(action)){
    const user=await session(request,env);if(!user.host)throw new StudioError('호스트만 검토할 수 있습니다.',403);
    const id=new URL(request.url).searchParams.get('id')||'';
    const proposal=await db.prepare('SELECT id,worker_id,base_hash,payload,status FROM studio_proposals WHERE id=?').bind(id).first<{id:string;worker_id:string;base_hash:string;payload:string;status:string}>();
    if(!proposal)throw new StudioError('변경 요청을 찾을 수 없습니다.',404);
    if(request.method==='GET'&&action==='proposal')return json({owner:proposal.worker_id,baseHash:proposal.base_hash,payload:JSON.parse(proposal.payload)});
    if(request.method!=='POST'||!['reject','published'].includes(action))throw new StudioError('지원하지 않는 작업입니다.',405);
    if(action==='published'){
      const current=await catalog();
      if(await hash(JSON.stringify(studioSlice(current,proposal.worker_id)))!==await hash(proposal.payload))throw new StudioError('아직 공개 콘텐츠와 일치하지 않습니다. 콘텐츠 발행 후 확인해 주세요.',409);
    }
    const status=action==='published'?'published':'rejected';
    const row=await db.prepare("UPDATE studio_proposals SET status=? WHERE id=? AND status='pending' RETURNING id").bind(status,id).first();
    if(!row)throw new StudioError('이미 처리한 변경 요청입니다.',409);
    return json({id,status});
  }
  const owner=new URL(request.url).searchParams.get('owner')||'';
  const user=await authorize(request,env,owner),approved=await catalog(),baseHash=await hash(JSON.stringify(studioSlice(approved,owner)));
  if(request.method==='GET'&&action==='draft'){
    const draft=await db.prepare('SELECT revision,base_hash,payload FROM studio_drafts WHERE user_id=? AND worker_id=?').bind(user.id,owner).first<{revision:number;base_hash:string;payload:string}>();
    return json({catalog:approved,baseHash:draft?.base_hash||baseHash,stale:!!draft&&draft.base_hash!==baseHash,revision:draft?.revision||0,payload:draft?JSON.parse(draft.payload):studioSlice(approved,owner)});
  }
  if(request.method!=='POST'||!['draft','submit'].includes(action))return json({error:'지원하지 않는 작업입니다.'},404);
  sameOrigin(request);const input=await body(request);
  if(input?.baseHash!==baseHash)throw new StudioError('공개 승인본이 바뀌었습니다. 변경안을 보관하고 최신 승인본과 비교해 주세요.',409);
  if(!Number.isInteger(input.revision)||input.revision<0)throw new StudioError('변경안 버전이 올바르지 않습니다.');
  try{mergeStudio(approved,owner,input.payload);}catch(error){throw new StudioError(error instanceof Error?error.message:'잘못된 변경안입니다.');}
  const payload=JSON.stringify(input.payload);
  if(action==='draft'){
    if(input.revision>0&&!await db.prepare('SELECT revision FROM studio_drafts WHERE user_id=? AND worker_id=?').bind(user.id,owner).first())throw new StudioError('저장된 변경안을 찾을 수 없습니다. 다시 불러와 주세요.',409);
    const row=await db.prepare('INSERT INTO studio_drafts(user_id,worker_id,revision,base_hash,payload,updated) VALUES(?,?,1,?,?,?) ON CONFLICT(user_id,worker_id) DO UPDATE SET revision=revision+1,base_hash=excluded.base_hash,payload=excluded.payload,updated=excluded.updated WHERE studio_drafts.revision=? RETURNING revision').bind(user.id,owner,baseHash,payload,Date.now(),input.revision).first<{revision:number}>();
    if(!row)throw new StudioError('다른 창에서 변경안을 저장했습니다. 다시 불러와 주세요.',409);
    return json({revision:row.revision});
  }
  const reason=input.reason;
  if(typeof reason!=='string'||!reason.trim()||reason.length>1000)throw new StudioError('변경 이유를 1–1,000자로 적어주세요.');
  const id=crypto.randomUUID();
  const row=await db.prepare("INSERT INTO studio_proposals(id,user_id,worker_id,base_hash,payload,reason,created) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM studio_proposals WHERE user_id=? AND status='pending')<5 AND NOT EXISTS(SELECT 1 FROM studio_proposals WHERE user_id=? AND worker_id=? AND status='pending' AND payload=?) RETURNING id").bind(id,user.id,owner,baseHash,payload,reason.trim(),Date.now(),user.id,user.id,owner,payload).first();
  if(!row)throw new StudioError('같은 변경안을 이미 제출했거나 검토 대기 중인 요청이 5개입니다.',409);
  return json({id,status:'pending'},201);
}
