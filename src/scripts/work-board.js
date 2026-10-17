import { matchesWork } from './work-filter.mjs';
import { loadContent } from './content-loader.mjs';
import { renderWorks } from './content-render.mjs';
import {onPage} from './page-lifecycle.mjs';
onPage('work-board',async(root,life)=>{

let entries=JSON.parse(root.dataset.entries);
const form=document.getElementById('work-filters'),grid=document.getElementById('work-grid');
const content=await loadContent();
if(!life.alive())return;
if(content) {
  entries=renderWorks(grid,content,root.dataset.lang,JSON.parse(root.dataset.labels));
  const select=(name,items)=>{
    const field=form.elements.namedItem(name),placeholder=field.options[0].cloneNode(true),group=field.querySelector('optgroup').cloneNode(false);
    group.append(...items.map(([value,label])=>new Option(label,value)));
    field.replaceChildren(placeholder,group);
  };
  select('worker',content.workers.map(w=>[w.id,w.name]));
  select('tag',[...new Set(entries.flatMap(e=>e.tags))].sort().map(tag=>[tag,tag]));
}
root.dataset.contentSource=content?'remote':'embedded';
const cards=[...grid.querySelectorAll('[data-entry]')],viewButtons=[...root.querySelectorAll('button[data-view]')];
const defaultView=grid.dataset.view;
let view=defaultView;
const names=['q','worker','kind','status','tag'];
function closeInfo() {
  cards.forEach(card=>{delete card.dataset.infoOpen;card.querySelector('.work-info-toggle').setAttribute('aria-expanded','false');});
}
function restore() {
  const params=new URLSearchParams(location.search);
  for(const name of names) {
    const field=form.elements.namedItem(name),value=params.get(name)||'';
    if(field.tagName==='SELECT')field.value=[...field.options].some(o=>o.value===value)?value:'';else field.value=value;
  }
  view=['gallery','mosaic','posts'].includes(params.get('view'))?params.get('view'):defaultView;
  update(false);
}
function update(writeUrl=true) {
  closeInfo();
  const filters=Object.fromEntries(new FormData(form));
  let count=0;
  for(let i=0;i<entries.length;i++){const visible=matchesWork(entries[i],filters);cards[i].hidden=!visible;if(visible)count++;}
  grid.dataset.view=view;viewButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  document.getElementById('work-count').textContent=root.dataset.count.replace('{count}',count);
  document.getElementById('work-empty').hidden=count!==0;
  if(writeUrl){const params=new URLSearchParams();for(const name of names)if(filters[name])params.set(name,filters[name]);if(view!==defaultView)params.set('view',view);history.replaceState(history.state,'',location.pathname+(params.size?'?'+params:''));}
}
form.addEventListener('submit',e=>e.preventDefault());
form.addEventListener('input',()=>update());
form.addEventListener('change',()=>update());
form.addEventListener('reset',()=>{queueMicrotask(()=>update());});
viewButtons.forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;update();}));
root.querySelectorAll('[data-tag]').forEach(b=>b.addEventListener('click',()=>{form.elements.namedItem('tag').value=b.dataset.tag;update();}));
root.querySelectorAll('.work-info-toggle').forEach(button=>button.addEventListener('click',()=>{
  const card=button.closest('[data-entry]'),open=card.dataset.infoOpen!=='true';
  delete card.dataset.infoDismissed;
  closeInfo();if(open)card.dataset.infoOpen='true';button.setAttribute('aria-expanded',String(open));
}));
life.on(document,'click',event=>{if(!event.target.closest('.work-card'))closeInfo();});
cards.forEach(card=>card.addEventListener('pointerleave',()=>{delete card.dataset.infoDismissed;}));
root.addEventListener('keydown',event=>{if(event.key==='Escape'&&view!=='posts'){const card=event.target.closest('.work-card');closeInfo();if(card){card.dataset.infoDismissed='true';card.querySelector('.work-info-toggle').focus();}}});
life.on(window,'popstate',restore);
root.classList.add('ready');restore();
});
