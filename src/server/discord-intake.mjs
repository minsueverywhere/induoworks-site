import {INTAKE_FILE_BYTES,MEDIA_MIME,validateMediaFile} from '../media-file.mjs';
export const INTAKE_TOTAL_BYTES=64*1024*1024;
const reply=content=>Response.json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
export async function limitedBytes(response,limit){
  if(Number(response.headers.get('content-length'))>limit)throw Error('File is too large.');
  const reader=response.body?.getReader();if(!reader)throw Error('File is empty.');
  const chunks=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw Error('File is too large.');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function verifyDiscord(request,body,key,now=Date.now()){
  const signature=request.headers.get('x-signature-ed25519')||'',timestamp=request.headers.get('x-signature-timestamp')||'';
  if(!/^[a-f\d]{128}$/i.test(signature)||!/^\d{10}$/.test(timestamp)||!/^[a-f\d]{64}$/i.test(key||'')||Math.abs(now/1000-Number(timestamp))>300)return false;
  const bytes=hex=>Uint8Array.from(hex.match(/../g),v=>parseInt(v,16));
  const publicKey=await crypto.subtle.importKey('raw',bytes(key),'Ed25519',false,['verify']);
  return crypto.subtle.verify('Ed25519',publicKey,bytes(signature),new TextEncoder().encode(timestamp+body));
}
export async function expireUploads(db,now=Date.now()){
  await db.batch([
    db.prepare("DELETE FROM studio_upload_chunks WHERE upload_id IN (SELECT id FROM studio_uploads WHERE expires<=? AND status IN ('receiving','pending','failed','rejected','expired'))").bind(now),
    db.prepare("UPDATE studio_uploads SET status='expired' WHERE expires<=? AND status IN ('receiving','pending')").bind(now),
    db.prepare("DELETE FROM studio_uploads WHERE created<? AND status IN ('expired','rejected','failed','published')").bind(now-30*86400000),
  ]);
}
export async function discordIntake(request,env,waitUntil,fetcher=fetch){
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  const raw=new TextDecoder().decode(await limitedBytes(request,32768));
  if(!await verifyDiscord(request,raw,env.DISCORD_PUBLIC_KEY))return new Response('Invalid signature',{status:401});
  const interaction=JSON.parse(raw);
  if(interaction.application_id!==env.DISCORD_CLIENT_ID||interaction.guild_id!==env.DISCORD_GUILD_ID||interaction.type!==2||interaction.data?.name!=='submit-work')return reply('This command is only available in Induo Works.');
  const user=interaction.member?.user?.id,id=interaction.id,options=Object.fromEntries((interaction.data.options||[]).map(o=>[o.name,o.value]));
  if(!/^\d{17,22}$/.test(user||'')||!/^\d{17,22}$/.test(id||'')||!/^[\w-]{1,100}$/.test(options.worker||''))return reply('Choose a valid workshop.');
  const db=env.STUDIO_DB;if(!db||!env.STUDIO_RATE_LIMITER)return reply('Work submissions are not configured yet.');
  if(!(await env.STUDIO_RATE_LIMITER.limit({key:'discord:'+user})).success)return reply('Please wait before submitting again.');
  const member=await db.prepare('SELECT user_id FROM studio_members WHERE user_id=? AND worker_id=? UNION SELECT user_id FROM studio_hosts WHERE user_id=?').bind(user,options.worker,user).first();
  if(!member)return reply('The host must connect your Discord account to this workshop first.');
  if(typeof options.title!=='string'||!options.title.trim()||options.title.length>100||typeof options.description!=='string'||!options.description.trim()||options.description.length>1000)return reply('Add a title (1–100 characters) and description (1–1,000 characters).');
  const attachment=interaction.data.resolved?.attachments?.[options.file],extension=attachment?.filename?.split('.').pop().toLowerCase();
  if(!attachment||!MEDIA_MIME[extension]||!Number.isInteger(attachment.size)||attachment.size<=0||attachment.size>INTAKE_FILE_BYTES)return reply('Use a PNG, JPEG, WebP, AVIF, GIF, MP3 or Opus OGG file up to 8 MiB. WAV and executable files are not accepted.');
  let url;try{url=new URL(attachment.url);}catch{return reply('The attachment URL is invalid.');}
  if(url.protocol!=='https:'||url.hostname!=='cdn.discordapp.com'||url.port||url.username||url.password||!/^\/(?:attachments|ephemeral-attachments)\/\d+\/\d+\//.test(url.pathname))return reply('Use a file attached directly to this command.');
  await expireUploads(db);
  if(await db.prepare('SELECT id FROM studio_uploads WHERE id=?').bind(id).first())return reply('This submission has already been received.');
  const created=Date.now(),filename='work.'+extension,kind=['ogg','mp3'].includes(extension)?'music':'image';
  const row=await db.prepare("INSERT INTO studio_uploads(id,user_id,worker_id,title,description,filename,size,kind,created,expires) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM studio_uploads WHERE user_id=? AND status IN ('receiving','pending','publishing'))<3 AND (SELECT COUNT(*) FROM studio_uploads WHERE status IN ('receiving','pending','publishing'))<100 AND (SELECT COALESCE(SUM(size),0) FROM studio_uploads WHERE status IN ('receiving','pending','publishing'))+?<=? ON CONFLICT(id) DO NOTHING RETURNING id").bind(id,user,options.worker,options.title.trim(),options.description.trim(),filename,attachment.size,kind,created,created+7*86400000,user,attachment.size,INTAKE_TOTAL_BYTES).first();
  if(!row)return reply('The submission queue is full (3 files per account, 64 MiB total). Please ask the host to review pending work.');
  waitUntil((async()=>{
    let message,stage='download',httpStatus;
    try{
      // Workers supports follow/manual only; reject redirects without following them.
      const response=await fetcher(url.href,{redirect:'manual',signal:AbortSignal.timeout(15000)});httpStatus=response.status;if(!response.ok)throw Error('Could not download the attachment.');
      stage='format';const bytes=await limitedBytes(response,INTAKE_FILE_BYTES);if(bytes.length!==attachment.size)throw Error('The attachment size changed.');validateMediaFile(filename,bytes,INTAKE_FILE_BYTES);
      stage='hash';
      const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
      stage='storage';
      const writes=[];for(let part=0,offset=0;offset<bytes.length;part++,offset+=512*1024)writes.push(db.prepare('INSERT INTO studio_upload_chunks(upload_id,part,bytes) VALUES(?,?,?)').bind(id,part,bytes.slice(offset,offset+512*1024).buffer));
      writes.push(db.prepare("UPDATE studio_uploads SET sha256=?,status='pending' WHERE id=? AND status='receiving'").bind(sha,id));await db.batch(writes);
      message='Your work is awaiting host review. If approved, it will be published on induo.works and become available for your workshop. Pending files expire after 7 days. Reference: '+id;
    }catch(error){
      console.error('Discord work intake failed',stage,httpStatus||0,error?.name||'Error');
      await db.batch([db.prepare('DELETE FROM studio_upload_chunks WHERE upload_id=?').bind(id),db.prepare("UPDATE studio_uploads SET status='failed' WHERE id=? AND status='receiving'").bind(id)]);
      message='The file could not be accepted ('+stage+(stage==='download'&&httpStatus?' HTTP '+httpStatus:'')+'). Ask the host to check this reference: '+id+'. Nothing was published.';
    }
    try{await fetcher('https://discord.com/api/v10/webhooks/'+env.DISCORD_CLIENT_ID+'/'+interaction.token+'/messages/@original',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:message,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(8000)});}catch{/* Submission state remains available to the host. */}
  })());
  return Response.json({type:5,data:{flags:64}});
}
