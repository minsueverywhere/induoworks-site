import { loadContent } from './content-loader.mjs';
import { localizedPath } from './content-catalog.mjs';
import { elements } from './content-render.mjs';
import {mountExternal} from './external-player.mjs';
import {onPage} from './page-lifecycle.mjs';
onPage('work-detail',async(root,life)=>{
const lang=root.dataset.lang,labels=JSON.parse(root.dataset.labels);
const slug=root.dataset.generic==='true'?new URLSearchParams(location.search).get('id'):root.dataset.slug;
const content=await loadContent();
if(!life.alive())return;
const project=(content?.projects||JSON.parse(root.dataset.projects)).find(p=>p.slug===slug);
root.dataset.contentSource=content?'remote':'embedded';
const message=document.getElementById('work-detail-message');
if(!project) {
  root.hidden=true;message.hidden=false;
  message.textContent=lang==='ko'?'작품을 찾을 수 없습니다. Works에서 다시 찾아주세요.':'Work not found. Please return to Works.';
} else {
  if(project.externalUrl)life.cleanup(mountExternal(document.getElementById('detail-external'),project.externalUrl,project.title[lang],{lang}));
  const fields={...Object.fromEntries(['title','summary','role','challenge','approach','outcome'].map(k=>[k,project[k][lang]])),year:project.year,stack:project.stack.join(', '),status:{shipped:labels.shipped,'in-progress':labels.inProgress,paused:labels.paused}[project.status]};
  for(const [key,value] of Object.entries(fields))root.querySelector('[data-field="'+key+'"]').textContent=value;
  const el=elements(root),owners=content?.workers||JSON.parse(root.dataset.workers);
  document.getElementById('detail-creators').replaceChildren(...owners.filter(w=>project.workerIds?.includes(w.id)).map(w=>el('a',{class:'focus-ring underline underline-offset-4',href:localizedPath('/workers/#'+w.id,lang)},w.name)));
  document.getElementById('detail-links').replaceChildren(...[['href',labels.visitProject],['steamUrl',labels.viewOnSteam],['repo',labels.viewSource]].filter(([key])=>project[key]).map(([key,label])=>el('a',{...(project[key].startsWith('/')?{href:localizedPath(project[key],lang)}:{href:project[key],target:'_blank',rel:'noopener noreferrer'}),class:'focus-ring rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm hover:border-[var(--color-accent)]'},label)));
  document.title=project.title[lang]+' | Induo Works';
  root.hidden=false;message.hidden=true;
}
});
