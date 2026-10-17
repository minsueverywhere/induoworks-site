import {musicTracks,musicSummary} from './village-tracks.mjs';
import {externalPreview} from '../external-work.mjs';
export const localizedPath=(path,lang)=>lang==='ko'?'/ko'+path:path;
export const projectPath=(slug,lang)=>localizedPath('/work/detail/?id='+encodeURIComponent(slug),lang);

export function contentWorks(data, lang, staticLinks=false) {
  return [
    ...data.projects.map(p=>({
      id:'project:'+p.slug,title:p.title[lang],summary:p.summary[lang],
      kind:['site','experiment'].includes(p.kind)?'other':p.kind,
      workerIds:p.workerIds||[],tags:[...new Set([...p.stack,...(p.tags||[])])],
      status:p.status,year:p.year,href:staticLinks?localizedPath('/work/'+p.slug+'/',lang):projectPath(p.slug,lang),
      image:p.thumbnail?.src||externalPreview(p.externalUrl),imageWidth:p.thumbnail?.width||600,imageHeight:p.thumbnail?.height||400,
      imageAlt:p.thumbnail?.alt[lang]||p.title[lang],imageCaption:p.thumbnail?.caption[lang]||'',file:false,
    })),
    ...data.media.map(m=>({
      id:'media:'+m.id,title:m.title[lang],summary:m.description?.[lang]||(lang==='ko'?'작업실의 아트워크와 시각 작업물입니다.':'Artwork and visual work from the workshop.'),
      kind:'artwork',workerIds:m.workerIds,tags:m.tags,status:'shipped',year:'',href:m.original,
      image:m.preview,imageWidth:m.width,imageHeight:m.height,imageAlt:m.title[lang],imageCaption:'',file:true,
    })),
    ...musicTracks(data).map(track=>({id:'music:'+track.id,title:track.title,summary:musicSummary(track),kind:'music',workerIds:track.workerIds||[],tags:['Music'],status:'shipped',year:'',href:track.sources.ogg||track.sources.mp3,image:'',imageWidth:600,imageHeight:400,imageAlt:track.title,imageCaption:'',file:true})),
  ].map(entry=>{
    const creators=data.workers.filter(w=>entry.workerIds.includes(w.id)).map(w=>({id:w.id,name:w.name}));
    return {...entry,creators,search:[entry.title,entry.summary,entry.year,...entry.tags,...creators.map(w=>w.name)].join(' ')};
  });
}
