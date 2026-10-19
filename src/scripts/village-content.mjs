import { projectPath } from './content-catalog.mjs';
import { musicTracks, villageTrack } from './village-tracks.mjs';
import { villageWorld, groundPosition } from './village-world.mjs';
import { musicWorkPath } from './village-tracks.mjs';
import {roomFloors} from './village-room.mjs';
const localizePath=(path,lang)=>lang==='ko'?'/ko'+path:path;
export function villageContent(catalog,lang,_title) {
const {projects,workers,notices:villageNotices,media:villageMedia}=catalog;
const ko=lang==='ko',world=villageWorld(catalog);
const places = [
  ...workers.filter(worker=>worker.house).map(worker=>({
    id: worker.id, area: 'village', shape: 'house', ground:groundPosition(worker.house,'house'), ...worker.house, width: 96, height: 96,
    label: worker.name, title: worker.name, description: worker.description[lang],
  })),
  { id: 'noticeboard', area: 'village', shape: 'board', ground:groundPosition(world.noticeboard,'board'), ...world.noticeboard, width: 116*(world.noticeboard.size||1), height: 104*(world.noticeboard.size||1),
    label: ko?'마을 공고판':'Noticeboard', title: ko?'마을 공고판':'Noticeboard',
    description: villageNotices.map(n=>n.title[lang]+' — '+n.body[lang]).join('\n\n'),
    links: villageNotices.filter(n=>n.href).map(n=>({title:n.linkLabel?.[lang]||n.title[lang],href:n.href.startsWith('/')?localizePath(n.href,lang):n.href})),
    notes: villageNotices.length, noteTitle: villageNotices[0]?.title[lang], interactive: villageNotices.length>0 },
];
const roomPlaces = workers.filter(worker=>worker.house).flatMap(worker=>[
  // shortcut: one room holds nine project stands; add room pagination when a studio outgrows it.
  ...projects.filter(p=>p.workerIds?.includes(worker.id)).map((p,i)=>({id:worker.id+':'+p.slug,owner:worker.id,area:'room',shape:'game',x:1+(i%3)*3+(Math.floor(i/3)),y:7-(i%3)*3+(Math.floor(i/3)),width:56,height:72,label:p.title[lang],title:p.title[lang],description:p.summary[lang],externalUrl:p.externalUrl,links:[{title:ko?'작품 소개':'About this work',href:projectPath(p.slug,lang)}]})),
  {id:worker.id+'-jukebox',owner:worker.id,area:'room',shape:'jukebox',x:7,y:6,width:56,height:48,label:ko?'주크박스':'Jukebox',title:villageTrack(catalog,worker.id).title,music:villageTrack(catalog,worker.id),description:'',links:[{title:ko?'음악 Work 보기':'View music work',href:musicWorkPath(villageTrack(catalog,worker.id),lang)}]},
  ...villageMedia.filter(m=>m.workerIds.includes(worker.id)).map((m,i)=>({id:worker.id+':'+m.id,owner:worker.id,area:'room',shape:'artwork',x:1+i*2,y:3,width:56,height:72,label:m.title[lang],title:m.title[lang],description:m.description?.[lang]||(ko?'미리보기를 둘러보고 원하는 작품의 원본을 열어보세요.':'Browse the preview and open the original for a closer look.'),media:[m.id],badge:m.badge})),
]);
const villageWorkers=workers.filter(w=>w.house).map(w=>({id:w.id,name:w.name,description:w.description[lang],room:w.room}));
function display(e,area,owner,floor=0){
  if(e.kind==='guestbook')return {...e,id:'display:'+owner+':'+floor+':'+e.id,worldId:e.id,editType:'exhibit',area,owner,floor,ground:groundPosition(e,'exhibit'),shape:'guestbook',width:56,height:52,board:e.boardId||'main',label:e.title||(ko?'방명록':'Guestbook'),title:e.title||(ko?'방명록':'Guestbook'),description:''};
  const item=(e.kind==='project'?projects:e.kind==='media'?villageMedia:musicTracks(catalog)).find(i=>(i.id||i.slug)===e.ref);
  if(!item)return null;
  const title=typeof item.title==='string'?item.title:item.title[lang];
  return {...e,id:'display:'+(owner?owner+':'+floor+':':'')+e.id,worldId:e.id,editType:'exhibit',area,owner,floor,ground:groundPosition(e,'exhibit'),shape:e.kind==='project'?'game':e.kind==='media'?'artwork':'jukebox',...(e.kind==='media'?frame(e):{width:56,height:e.kind==='music'?48:72}),label:title,title,description:e.kind==='project'?item.summary[lang]:item.description?.[lang]||'',...(e.kind==='music'?{music:item,links:[{title:ko?'음악 Work 보기':'View music work',href:musicWorkPath(item,lang)}]}:e.kind==='project'?{externalUrl:item.externalUrl,links:[{title:ko?'작품 소개':'About this work',href:projectPath(item.slug,lang)}]}:{media:[item.id],badge:(e.width||1)>1||(e.frameHeight||1)>1?item.preview:item.badge})};
}
// Frame size in tiles and height steps; the click target grows with the drawn frame.
function frame(e){const frameWidth=e.width||1,frameHeight=e.frameHeight||1;return {frameWidth,frameHeight,width:56+48*(frameWidth-1),height:Math.round(72*(1+.5*(frameHeight-1)))};}
const allPlaces = [...places,...roomPlaces.filter(p=>!catalog.workers.find(w=>w.id===p.owner)?.room?.hiddenItems?.includes(p.id)).map(p=>({...p,floor:0})),...(world.exhibits||[]).map(e=>display(e,'village')),
 ...workers.filter(w=>w.house).flatMap(w=>roomFloors(w).flatMap((f,i)=>f.exhibits.map(e=>display(e,'room',w.id,i))))].filter(Boolean);

return {world,places:allPlaces,workers:villageWorkers,media:villageMedia.map(m=>({...m,title:m.title[lang]})),music:villageTrack(catalog)};
}
