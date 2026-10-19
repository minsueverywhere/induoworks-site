import {studioDB,session,sameOrigin,json,rateLimit,StudioError,type StudioEnv} from './studio-auth.ts';
import {body,catalog} from './studio-drafts.ts';
type Entry={id:string;user_id:string;name:string;message:string;created:number;author_worker_id:string|null;author_team_name:string|null;parent_id:string|null;reply_to_id:string|null;deleted:number;contact_email:string|null;contact_discord:string|null};
export async function studioGuestbook(request:Request,env:StudioEnv){
  if(!['GET','POST','DELETE'].includes(request.method))throw new StudioError('지원하지 않는 작업입니다.',405);
  if(request.method!=='GET')sameOrigin(request);
  await rateLimit(request,env);
  const url=new URL(request.url),owner=url.searchParams.get('owner')||'',cursor=url.searchParams.get('before'),board=url.searchParams.get('board')||'main';
  if(!/^[a-z0-9-]{1,80}$/.test(board))throw new StudioError('노트를 확인해 주세요.');
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(owner))throw new StudioError('작업실을 찾을 수 없습니다.',404);
  if(cursor&&!/^\d{1,16}:[a-f0-9-]{36}$/.test(cursor))throw new StudioError('페이지를 확인해 주세요.');
  let user:Awaited<ReturnType<typeof session>>|null=null;
  try{user=await session(request,env);}catch(error){if(!(error instanceof StudioError)||error.status!==401)throw error;}
  if(request.method!=='GET'&&!user)throw new StudioError('Discord 로그인이 필요합니다.',401);
  const db=studioDB(env),approved=await catalog(),worker=approved.workers.find((w:{id:string;house?:unknown})=>w.id===owner&&w.house);
  if(!worker)throw new StudioError('작업실을 찾을 수 없습니다.',404);
  const live=await db.prepare('SELECT room FROM studio_rooms WHERE worker_id=?').bind(owner).first<{room:string}>();
  const room=live?JSON.parse(live.room):worker.room;
  if(!room?.floors?.some((f:{exhibits:{kind:string;boardId?:string}[]})=>f.exhibits.some(e=>e.kind==='guestbook'&&(e.boardId||'main')===board)))throw new StudioError('이 작업실에는 방명록이 없습니다.',404);
  const retryAfter=async()=>{const row=user?await db.prepare('SELECT last_created FROM studio_guestbook_cooldowns WHERE user_id=?').bind(user.id).first<{last_created:number}>():null;return row?Math.max(0,Math.ceil((row.last_created+60000-Date.now())/1000)):0;};
  const teams=user?approved.workers.filter((w:{id:string})=>user!.owners.includes(w.id)).map((w:{id:string;name:string})=>({id:w.id,name:w.name})):[];
  if(request.method==='POST'){
    const input=await body(request),message=typeof input?.message==='string'?input.message.trim():'';
    if(!message||message.length>300||Object.keys(input).some(k=>!['message','team','hideName','parent','email','shareDiscord'].includes(k)))throw new StudioError('방명록은 1~300자로 작성해 주세요.');
    if(input.team!==undefined&&typeof input.team!=='string'||input.hideName!==undefined&&typeof input.hideName!=='boolean')throw new StudioError('표시 이름을 확인해 주세요.');
    if(input.email!==undefined&&(typeof input.email!=='string'||input.email.length>254||input.email!==''&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.email))||input.shareDiscord!==undefined&&typeof input.shareDiscord!=='boolean')throw new StudioError('공개 연락처를 확인해 주세요.');
    const team=teams.find((t:{id:string})=>t.id===input.team);
    if(input.team&&!team||input.hideName&&!team)throw new StudioError('연동된 소속만 표시하거나 이름을 숨길 수 있습니다.',403);
    const targetId=input.parent??null;
    if(targetId!==null&&(typeof targetId!=='string'||!/^[a-f0-9-]{36}$/.test(targetId)))throw new StudioError('답글 대상을 확인해 주세요.');
    const target=targetId?await db.prepare('SELECT id,parent_id FROM studio_guestbook WHERE id=? AND worker_id=? AND board_id=? AND deleted=0').bind(targetId,owner,board).first<{id:string;parent_id:string|null}>():null;
    if(targetId&&!target)throw new StudioError('답글 대상이 없거나 삭제되었습니다.',404);
    const parent=target?(target.parent_id||target.id):null,replyTo=target?.parent_id?target.id:null;
    if(parent&&!await db.prepare('SELECT id FROM studio_guestbook WHERE id=? AND worker_id=? AND board_id=? AND parent_id IS NULL AND deleted=0').bind(parent,owner,board).first())throw new StudioError('원글이 삭제되어 답글을 남길 수 없습니다.',404);
    const saved=await db.prepare('INSERT INTO studio_guestbook(id,worker_id,user_id,name,message,created,author_worker_id,author_team_name,parent_id,reply_to_id,board_id,contact_email,contact_discord) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM studio_guestbook_cooldowns WHERE user_id=? AND last_created>?) AND (SELECT COUNT(*) FROM studio_guestbook WHERE worker_id=?)<500 AND (? IS NULL OR EXISTS(SELECT 1 FROM studio_guestbook WHERE id=? AND worker_id=? AND board_id=? AND parent_id IS NULL AND deleted=0)) RETURNING id').bind(crypto.randomUUID(),owner,user!.id,input.hideName?'':user!.name,message,Date.now(),team?.id||null,team?.name||null,parent,replyTo,board,!input.hideName&&input.email?input.email:null,!input.hideName&&input.shareDiscord?user!.id:null,user!.id,Date.now()-60000,owner,parent,parent,owner,board).first();
    if(!saved)return json({error:'작성은 1분 간격이며 작업실당 원글·답글 합계 500개까지 보관합니다.',retryAfter:await retryAfter()},429);
  }
  if(request.method==='DELETE'){
    const input=await body(request);
    if(typeof input?.id!=='string'||!/^[a-f0-9-]{36}$/.test(input.id)||Object.keys(input).some(k=>k!=='id'))throw new StudioError('방명록 항목을 확인해 주세요.');
    const row=await db.prepare('SELECT user_id FROM studio_guestbook WHERE id=? AND worker_id=? AND board_id=? AND deleted=0').bind(input.id,owner,board).first<{user_id:string}>();
    if(!row)throw new StudioError('이미 삭제된 글입니다.',404);
    if(row.user_id!==user!.id&&!user!.host&&!user!.owners.includes(owner))throw new StudioError('삭제할 권한이 없습니다.',403);
    // Keep a nameless placeholder when other visitors still have replies.
    await db.batch([
      db.prepare("UPDATE studio_guestbook SET deleted=1,name='',message='삭제된 글입니다.',author_worker_id=NULL,author_team_name=NULL,contact_email=NULL,contact_discord=NULL WHERE id=? AND worker_id=?").bind(input.id,owner),
      db.prepare('DELETE FROM studio_guestbook WHERE worker_id=? AND deleted=1 AND parent_id IS NOT NULL').bind(owner),
      db.prepare('DELETE FROM studio_guestbook WHERE worker_id=? AND deleted=1 AND NOT EXISTS(SELECT 1 FROM studio_guestbook AS child WHERE child.parent_id=studio_guestbook.id)').bind(owner)
    ]);
  }
  const [before,id]=cursor?cursor.split(':'):[String(Date.now()+1),''];
  const rows=(await db.prepare('SELECT id,user_id,name,message,created,author_worker_id,author_team_name,parent_id,reply_to_id,deleted,contact_email,contact_discord FROM studio_guestbook WHERE worker_id=? AND board_id=? AND parent_id IS NULL AND (created<? OR (created=? AND id<?)) ORDER BY created DESC,id DESC LIMIT 21').bind(owner,board,Number(before),Number(before),id).all<Entry>()).results;
  const page=rows.slice(0,20),ids=page.map(row=>row.id);
  const replies=ids.length?(await db.prepare('SELECT id,user_id,name,message,created,author_worker_id,author_team_name,parent_id,reply_to_id,deleted,contact_email,contact_discord FROM studio_guestbook WHERE worker_id=? AND board_id=? AND parent_id IN ('+ids.map(()=>'?').join(',')+') ORDER BY created,id').bind(owner,board,...ids).all<Entry>()).results:[];
  const publicEntry=({user_id,contact_email,contact_discord,...entry}:Entry)=>{
    const team=approved.workers.find((w:{id:string})=>w.id===entry.author_worker_id);
    const target=entry.reply_to_id?replies.find(r=>r.id===entry.reply_to_id&&!r.deleted):null;
    return {...entry,contact:entry.name&&!entry.deleted?{email:contact_email,discordUserId:contact_discord}:null,replyTo:entry.reply_to_id?{id:entry.reply_to_id,name:target?(target.name||target.author_team_name||'Participant'):null}:null,deleted:!!entry.deleted,team:team?{id:team.id,hasHouse:!!team.house,contact:team.contact||null}:null,canDelete:!entry.deleted&&!!user&&(user.id===user_id||user.host||user.owners.includes(owner))};
  };
  return json({canWrite:!!user,retryAfter:await retryAfter(),identity:user?{id:user.id,name:user.name,teams}:null,entries:page.map(row=>({...publicEntry(row),replies:replies.filter(reply=>reply.parent_id===row.id).map(publicEntry)})),next:rows.length>20?rows[19].created+':'+rows[19].id:null});
}
