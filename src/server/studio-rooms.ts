import {authorize,studioDB,sameOrigin,json,rateLimit,StudioError,type StudioEnv} from './studio-auth.ts';
import {catalog,body} from './studio-drafts.ts';
import {studioSlice,mergeStudio} from './studio-content.mjs';
type RoomRow={room:string;previous_room:string;revision:number;updated:number};
export async function studioRooms(request:Request,env:StudioEnv,action:string,cache?:Cache){
  const owner=new URL(request.url).searchParams.get('owner')||'';
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(owner))throw new StudioError('작업실을 찾을 수 없습니다.',404);
  const db=studioDB(env);
  if(action==='room-view'){
    if(request.method!=='GET')throw new StudioError('GET 요청만 가능합니다.',405);
    // Ignore query noise and cookies: this cache contains public layout only.
    const key=new Request('https://induo.works/api/studio/room-view?owner='+owner);
    const cached=await cache?.match(key);if(cached)return cached;
    const row=await db.prepare('SELECT room,revision FROM studio_rooms WHERE worker_id=?').bind(owner).first<RoomRow>();
    const response=Response.json(row?{room:JSON.parse(row.room),revision:row.revision}:{room:null,revision:0},{headers:{'Cache-Control':'public, max-age=0, s-maxage=15','X-Content-Type-Options':'nosniff'}});
    await cache?.put(key,response.clone());return response;
  }
  if(request.method==='POST')sameOrigin(request);
  await rateLimit(request,env);await authorize(request,env,owner);
  const approved=await catalog(),base=studioSlice(approved,owner);
  const row=await db.prepare('SELECT room,previous_room,revision,updated FROM studio_rooms WHERE worker_id=?').bind(owner).first<RoomRow>();
  if(request.method==='GET'){
    if(row){base.room=JSON.parse(row.room);try{mergeStudio(approved,owner,base);}catch{throw new StudioError('등록 작품이 바뀌었습니다. 호스트에게 배치 확인을 요청해 주세요.',409);}}
    return json({catalog:approved,payload:base,revision:row?.revision||0,canRestore:!!row});
  }
  if(request.method!=='POST')throw new StudioError('지원하지 않는 작업입니다.',405);
  const input=await body(request);
  if(!input||Object.keys(input).some(key=>!['room','revision','restore'].includes(key))||!Number.isInteger(input.revision)||input.revision!==(row?.revision||0))throw new StudioError('다른 창에서 배치가 바뀌었습니다. 다시 열어 주세요.',409);
  if(row&&Date.now()-row.updated<5000)throw new StudioError('저장은 5초 간격으로 가능합니다.',429);
  if(input.restore===true&&!row)throw new StudioError('복원할 배치가 없습니다.',409);
  base.room=input.restore===true?JSON.parse(row!.previous_room):input.room;
  try{mergeStudio(approved,owner,base);}catch(error){throw new StudioError(error instanceof Error?error.message:'배치가 올바르지 않습니다.');}
  const room=JSON.stringify(base.room);
  if(new TextEncoder().encode(room).length>128*1024)throw new StudioError('배치는 128KiB 이하여야 합니다.',413);
  const previous=row?.room||JSON.stringify(studioSlice(approved,owner).room);
  const saved=await db.prepare('INSERT INTO studio_rooms(worker_id,room,previous_room,revision,updated) VALUES(?,?,?,1,?) ON CONFLICT(worker_id) DO UPDATE SET previous_room=studio_rooms.room,room=excluded.room,revision=studio_rooms.revision+1,updated=excluded.updated WHERE studio_rooms.revision=? AND studio_rooms.updated<=? RETURNING revision').bind(owner,room,previous,Date.now(),input.revision,Date.now()-5000).first<{revision:number}>();
  if(!saved)throw new StudioError('다른 창에서 저장했습니다. 다시 열어 주세요.',409);
  return json({room:base.room,revision:saved.revision});
}
