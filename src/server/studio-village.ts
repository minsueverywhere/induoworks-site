import {session,studioDB,sameOrigin,json,rateLimit,StudioError,type StudioEnv} from './studio-auth.ts';
import {catalog,body} from './studio-drafts.ts';
import {villageSlice,mergeVillage} from './studio-village-layout.mjs';
type VillageRow={layout:string;revision:number;updated:number};
export async function studioVillage(request:Request,env:StudioEnv,action:string,cache?:Cache){
  const db=studioDB(env);
  if(action==='village-view'){
    if(request.method!=='GET')throw new StudioError('GET 요청만 가능합니다.',405);
    const key=new Request('https://induo.works/api/studio/village-view'),cached=await cache?.match(key);if(cached)return cached;
    const row=await db.prepare('SELECT layout,revision FROM studio_village WHERE id=1').bind().first<VillageRow>();
    const response=Response.json({layout:row?JSON.parse(row.layout):null,revision:row?.revision||0},{headers:{'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});await cache?.put(key,response.clone());return response;
  }
  if(request.method==='POST')sameOrigin(request);
  await rateLimit(request,env);const user=await session(request,env);if(!user.host)throw new StudioError('마을은 호스트만 편집할 수 있습니다.',403);
  if(!['GET','POST'].includes(request.method))throw new StudioError('지원하지 않는 작업입니다.',405);
  const approved=await catalog(),row=await db.prepare('SELECT layout,revision,updated FROM studio_village WHERE id=1').bind().first<VillageRow>();
  if(request.method==='GET'){
    let current=approved;try{if(row)current=mergeVillage(approved,JSON.parse(row.layout));}catch{throw new StudioError('등록 업체·작품이 바뀌어 마을 배치를 확인해야 합니다.',409);}
    return json({catalog:current,payload:villageSlice(current),revision:row?.revision||0});
  }
  const input=await body(request);
  if(!input||Object.keys(input).some(k=>!['layout','revision'].includes(k))||!Number.isInteger(input.revision)||input.revision!==(row?.revision||0))throw new StudioError('다른 창에서 마을이 바뀌었습니다. 다시 열어 주세요.',409);
  if(row&&Date.now()-row.updated<5000)throw new StudioError('저장은 5초 간격으로 가능합니다.',429);
  try{mergeVillage(approved,input.layout);}catch(error){throw new StudioError(error instanceof Error?error.message:'배치를 확인해 주세요.');}
  const layout=JSON.stringify(input.layout);if(new TextEncoder().encode(layout).length>192*1024)throw new StudioError('마을 배치는 192KiB 이하여야 합니다.',413);
  const saved=await db.prepare('INSERT INTO studio_village(id,layout,previous_layout,revision,updated) VALUES(1,?,?,1,?) ON CONFLICT(id) DO UPDATE SET previous_layout=studio_village.layout,layout=excluded.layout,revision=studio_village.revision+1,updated=excluded.updated WHERE studio_village.revision=? AND studio_village.updated<=? RETURNING revision').bind(layout,row?.layout||JSON.stringify(villageSlice(approved)),Date.now(),input.revision,Date.now()-5000).first<{revision:number}>();
  if(!saved)throw new StudioError('다른 창에서 저장했습니다. 다시 열어 주세요.',409);
  return json({revision:saved.revision});
}
