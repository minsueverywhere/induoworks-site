import { projectPath } from './content-catalog.mjs';
import { villageTrack } from './village-tracks.mjs';
import { villageSign, noticeboard } from './village-layout.mjs';
const localizePath=(path,lang)=>lang==='ko'?'/ko'+path:path;
export function villageContent(catalog,lang,title) {
const {projects,workers,notices:villageNotices,media:villageMedia}=catalog;
const ko=lang==='ko',text={title};
const places = [
  ...workers.filter(worker=>worker.house).map(worker=>({
    id: worker.id, area: 'village', shape: 'house', ...worker.house, width: 96, height: 96,
    label: worker.name, title: worker.name, description: worker.description[lang],
  })),
  { id: 'welcome', area: 'village', shape: 'sign', ...villageSign, width: 336, height: 216,
    label: ko ? text.title+' · 마을 소개' : 'About '+text.title, title: text.title,
    description: ko ? '게임과 음악, 아트를 만드는 사람들의 마을입니다. 집을 눌러 제작자와 그 안의 작품들을 만나보세요.' : 'A meeting place for people making games, music and art. Visit a house to discover its maker and their work.' },
  { id: 'noticeboard', area: 'village', shape: 'board', ...noticeboard, width: 116, height: 104,
    label: ko?'마을 공고판':'Noticeboard', title: ko?'마을 공고판':'Noticeboard',
    description: villageNotices.map(n=>n.title[lang]+' — '+n.body[lang]).join('\n\n'),
    links: villageNotices.filter(n=>n.href).map(n=>({title:n.linkLabel?.[lang]||n.title[lang],href:n.href.startsWith('/')?localizePath(n.href,lang):n.href})),
    notes: villageNotices.length, noteTitle: villageNotices[0]?.title[lang], interactive: villageNotices.length>0 },
];
const roomPlaces = workers.filter(worker=>worker.house).flatMap(worker=>[
  // shortcut: one room holds nine project stands; add room pagination when a studio outgrows it.
  ...projects.filter(p=>p.workerIds?.includes(worker.id)).map((p,i)=>({id:worker.id+':'+p.slug,owner:worker.id,area:'room',shape:'game',x:1+(i%3)*3+(Math.floor(i/3)),y:7-(i%3)*3+(Math.floor(i/3)),width:72,height:78,label:p.title[lang],title:p.title[lang],description:p.summary[lang],links:[{title:ko?'작품 소개':'About this work',href:projectPath(p.slug,lang)}]})),
  {id:worker.id+'-jukebox',owner:worker.id,area:'room',shape:'jukebox',x:7,y:6,width:58,height:78,label:ko?'주크박스':'Jukebox',title:ko?'작업실의 주크박스':'Workshop jukebox',music:villageTrack(catalog,worker.id),description:ko?villageTrack(catalog,worker.id).title+'을 들으며 잠시 쉬어 가세요.':'Stay a while with '+villageTrack(catalog,worker.id).title+'.'},
  ...villageMedia.filter(m=>m.workerIds.includes(worker.id)).map((m,i)=>({id:worker.id+':'+m.id,owner:worker.id,area:'room',shape:'artwork',x:1+i*2,y:3,width:70,height:90,label:m.title[lang],title:m.title[lang],description:ko?'미리보기를 둘러보고 원하는 작품의 원본을 열어보세요.':'Browse the preview and open the original for a closer look.',media:[m.id],badge:m.badge})),
]);
const villageWorkers=workers.filter(w=>w.house).map(w=>({id:w.id,name:w.name,description:w.description[lang]}));
const allPlaces = [...places,...roomPlaces];

return {places:allPlaces,workers:villageWorkers,media:villageMedia.map(m=>({...m,title:m.title[lang]})),music:villageTrack(catalog)};
}
