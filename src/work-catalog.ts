import { soundtrackWorks } from './scripts/village-tracks.mjs';
import {externalPreview} from './external-work.mjs';
import { projects, labs, workers } from './config';
import { villageMedia } from './village-media';
import catalog from '../content/catalog.json';
import { localizePath, type Locale } from './i18n';

export function workCatalog(lang: Locale) {
  const entries = [
    ...projects.map(p => ({
      id: 'project:'+p.slug, title: p.title[lang], summary: p.summary[lang],
      kind: p.kind==='site'||p.kind==='experiment' ? 'other' : p.kind,
      workerIds: p.workerIds||[], tags: [...new Set([...p.stack,...(p.tags||[])])],
      status: p.status, year: p.year, href: localizePath('/work/'+p.slug+'/',lang),
      image: p.thumbnail?.src||p.cover?.src||p.gallery?.[0]?.src.src||externalPreview(p.externalUrl),
      imageWidth: p.thumbnail?.width||p.cover?.width||p.gallery?.[0]?.src.width||600,
      imageHeight: p.thumbnail?.height||p.cover?.height||p.gallery?.[0]?.src.height||400,
      imageAlt: p.thumbnail?.alt[lang]||p.gallery?.[0]?.alt[lang]||p.title[lang],
      imageCaption: p.thumbnail?.caption[lang]||'', file: false,
    })),
    ...labs.map(l => ({
      id: 'lab:'+l.slug, title: l.title[lang], summary: l.summary[lang], kind: 'other',
      workerIds: [] as string[], tags: l.stack, status: 'experiment', year: l.year,
      href: localizePath('/labs/'+l.slug+'/',lang), image: '', imageWidth: 600, imageHeight: 400, imageAlt: '', imageCaption: '', file: false,
    })),
    ...villageMedia.map(m => ({
      id: 'media:'+m.id, title: m.title[lang],
      summary: m.description?.[lang]||(lang==='ko' ? '작업실의 아트워크와 시각 작업물입니다.' : 'Artwork and visual work from the workshop.'),
      kind: 'artwork', workerIds: m.workerIds, tags: m.tags, status: 'shipped', year: '',
      href: m.original, image: m.preview, imageWidth: m.width, imageHeight: m.height, imageAlt: m.title[lang], imageCaption: '', file: true,
    })),
    ...soundtrackWorks(catalog,lang),
  ];
  return entries.map(entry => {
    const creators = workers.filter(w=>entry.workerIds.includes(w.id)).map(w=>({id:w.id,name:w.name}));
    return {...entry,creators,search:[entry.title,entry.summary,entry.year,...entry.tags,...creators.map(w=>w.name)].join(' ')};
  });
}
