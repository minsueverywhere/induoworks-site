import { matchesWork } from './work-filter.mjs';
import { loadContent } from './content-loader.mjs';
import { elements, renderWorks } from './content-render.mjs';
import {onPage} from './page-lifecycle.mjs';
onPage('work-board',async(root,life)=>{

let entries=JSON.parse(root.dataset.entries);
const form=document.getElementById('work-filters'),grid=document.getElementById('work-grid');
const content=await loadContent();
if(!life.alive())return;
if(content) {
  entries=renderWorks(grid,content,root.dataset.lang,JSON.parse(root.dataset.labels));
  const select=(name,items)=>{
    const field=form.elements.namedItem(name),placeholder=field.options[0].cloneNode(true);
    field.replaceChildren(placeholder,...items.map(([value,label])=>new Option(label,value)));
  };
  select('worker',content.workers.map(w=>[w.id,w.name]));
  document.getElementById('work-tags').replaceChildren(...[...new Set(entries.flatMap(e=>e.tags))].sort().map(tag=>new Option('','#'+tag)));
}
root.dataset.contentSource=content?'remote':'embedded';
const categories=document.getElementById('work-categories'),el=elements(root),ko=root.dataset.lang==='ko',labels=JSON.parse(root.dataset.labels),chips=[];
// Shop-style chip rows: each chip shows how many works it would leave, given every other filter.
function chipRow(title,name,items){
  const row=el('div',{class:'work-chip-row',role:'group','aria-label':title},el('span',{class:'work-chip-label'},title));
  for(const [i,[value,label]]of items.entries()){
    if(i)row.append(el('span',{class:'work-sep','aria-hidden':'true'},'·'));
    const b=el('button',{type:'button',class:'work-chip','data-name':name,'data-value':value},label,' ',el('span',{class:'work-chip-count'}));
    b.addEventListener('click',()=>{const field=form.elements.namedItem(name);field.value=field.value===value?'':value;update();});
    chips.push(b);row.append(b);
  }
  categories.append(row);
}
// Search and reset sit beside the title; reset still targets the form through its form attribute.
root.querySelector('.work-heading h1').after(el('div',{class:'work-summary-line'},form,form.querySelector('.work-reset')));
chipRow(ko?'작업자':'Worker','worker',[...form.elements.namedItem('worker').options].filter(o=>o.value&&entries.some(e=>e.workerIds.includes(o.value))).map(o=>[o.value,o.textContent]));
chipRow(ko?'분류':'Field','kind',Object.entries(labels.kinds).filter(([id])=>entries.some(e=>e.kind===id)));
chipRow(ko?'상태':'Status','status',Object.entries(labels.statuses).filter(([id])=>entries.some(e=>e.status===id)));
const cards=[...grid.querySelectorAll('[data-entry]')],viewButtons=[...root.querySelectorAll('button[data-view]')];
const defaultView=grid.dataset.view;
let view=defaultView;
const names=['q','worker','kind','status'];
function closeInfo() {
  cards.forEach(card=>{delete card.dataset.infoOpen;card.querySelector('.work-info-toggle').setAttribute('aria-expanded','false');});
}
function restore() {
  const params=new URLSearchParams(location.search);
  for(const name of names) {
    const field=form.elements.namedItem(name),value=params.get(name)||'';
    if(field.tagName==='SELECT')field.value=[...field.options].some(o=>o.value===value)?value:'';else field.value=value;
  }
  if(params.get('tag')&&!params.get('q'))form.elements.namedItem('q').value='#'+params.get('tag');
  view=['gallery','mosaic','posts'].includes(params.get('view'))?params.get('view'):defaultView;
  update(false);
}
function update(writeUrl=true) {
  closeInfo();
  const filters=Object.fromEntries(new FormData(form));
  for(const b of chips){const {name,value}=b.dataset,count=entries.filter(e=>matchesWork(e,{...filters,[name]:value})).length;b.setAttribute('aria-pressed',String(filters[name]===value));b.disabled=!count&&filters[name]!==value;b.lastChild.textContent=count;}
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
// The reset event fires before the fields are cleared, so update after the reset finishes.
form.addEventListener('reset',()=>setTimeout(update));
viewButtons.forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;update();}));
root.querySelectorAll('[data-tag]').forEach(b=>b.addEventListener('click',()=>{form.elements.namedItem('q').value='#'+b.dataset.tag;update();}));
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
