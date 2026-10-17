import { contentWorks, localizedPath } from './content-catalog.mjs';

// Astro scopes styles with attributes; new elements keep the same scope as the prerendered view.
export function elements(container) {
  const scope=[...container.attributes].filter(a=>a.name.startsWith('data-astro-cid-')).map(a=>a.name);
  return (tag,attrs={},...children)=>{
    const node=document.createElement(tag);
    for(const key of scope)node.setAttribute(key,'');
    for(const [key,value] of Object.entries(attrs))if(value!==undefined)node.setAttribute(key,String(value));
    node.append(...children.flat().filter(v=>v!==null&&v!==undefined));return node;
  };
}

export function renderWorks(grid,data,lang,labels) {
  const el=elements(grid),entries=contentWorks(data,lang);
  const link=(cls,entry,...children)=>el('a',{class:cls,href:entry.href,'aria-label':entry.title,target:entry.file?'_blank':undefined,rel:entry.file?'noopener noreferrer':undefined},...children);
  grid.replaceChildren(...entries.map(entry=>{
    const image=el('div',{class:'work-image'},entry.image?el('img',{src:entry.image,alt:entry.imageAlt,loading:'lazy',decoding:'async',width:entry.imageWidth,height:entry.imageHeight}):el('div',{class:'work-placeholder','aria-hidden':'true'},el('span',{},entry.title.split(/[\s-]+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()),el('small',{},labels.placeholder)));
    if(entry.image)image.style.setProperty('--work-art','url('+JSON.stringify(entry.image)+')');
    return el('article',{class:'work-card','data-entry':entry.id},
      link('work-preview focus-ring',entry,image),
      el('div',{class:'work-info',id:'work-info-'+entry.id},
        link('work-open focus-ring',entry,el('div',{class:'work-copy'},el('p',{class:'work-category'},[labels.kinds[entry.kind],entry.year,entry.imageCaption].filter(Boolean).join(' · ')),el('h2',{},entry.title+' ',el('span',{'aria-hidden':'true'},'↗')),el('p',{class:'work-summary'},entry.summary))),
        el('div',{class:'work-tags'},entry.tags.map(tag=>el('button',{type:'button','data-tag':tag},tag))),
        el('div',{class:'work-meta'},el('p',{},entry.creators.map(c=>el('a',{class:'focus-ring',href:localizedPath('/workers/#'+c.id,lang)},c.name))),el('span',{class:'work-status'},labels.statuses[entry.status]))),
      el('button',{type:'button',class:'work-info-toggle','aria-label':labels.info+entry.title,'aria-controls':'work-info-'+entry.id,'aria-expanded':'false'},'ⓘ'));
  }));
  return entries;
}

export function renderWorkers(container,data,lang,labels) {
  const el=elements(container),catalog=contentWorks(data,lang);
  container.replaceChildren(...data.workers.map(worker=>{
    const works=catalog.filter(w=>w.workerIds.includes(worker.id)),logo=data.media.find(m=>m.id===worker.logoMediaId);
    return el('article',{id:worker.id,class:'worker-card'},
      el('div',{},logo?el('img',{class:'worker-logo',src:logo.preview,alt:logo.title[lang],width:logo.width,height:logo.height,loading:'lazy',decoding:'async'}):null,
        el('h2',{},worker.name),el('p',{},worker.description[lang]),
        worker.href?el('a',{class:'focus-ring',href:worker.href,target:'_blank',rel:'noopener noreferrer'},labels.website+' ↗'):null,
        worker.house?el('a',{class:'focus-ring worker-village',href:localizedPath('/?worker='+worker.id,lang)},labels.visit+' ↗'):null),
      el('div',{},el('h3',{},labels.works+' ',el('span',{},String(works.length))),
        el('ul',{},works.map(work=>el('li',{},el('a',{class:'focus-ring',href:work.href,target:work.file?'_blank':undefined,rel:work.file?'noopener noreferrer':undefined},el('strong',{},work.title),el('span',{},work.summary))))),
        el('a',{class:'focus-ring worker-all',href:localizedPath('/work/?worker='+worker.id,lang)},labels.all+' ↗')));
  }));
}
