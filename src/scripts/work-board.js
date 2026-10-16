import { matchesWork } from './work-filter.mjs';
const root=document.getElementById('work-board');
const entries=JSON.parse(root.dataset.entries),form=document.getElementById('work-filters'),grid=document.getElementById('work-grid');
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
  const summary=document.getElementById('work-filter-summary'),active=names.filter(name=>filters[name]).length;
  summary.textContent=summary.dataset.label+(active?' · '+active:'');
  let count=0;
  for(let i=0;i<entries.length;i++){const visible=matchesWork(entries[i],filters);cards[i].hidden=!visible;if(visible)count++;}
  grid.dataset.view=view;viewButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  document.getElementById('work-count').textContent=root.dataset.count.replace('{count}',count);
  document.getElementById('work-empty').hidden=count!==0;
  if(writeUrl){const params=new URLSearchParams();for(const name of names)if(filters[name])params.set(name,filters[name]);if(view!==defaultView)params.set('view',view);history.replaceState(null,'',location.pathname+(params.size?'?'+params:''));}
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
document.addEventListener('click',event=>{if(!event.target.closest('.work-card'))closeInfo();});
cards.forEach(card=>card.addEventListener('pointerleave',()=>{delete card.dataset.infoDismissed;}));
root.addEventListener('keydown',event=>{if(event.key==='Escape'&&view!=='posts'){const card=event.target.closest('.work-card');closeInfo();if(card){card.dataset.infoDismissed='true';card.querySelector('.work-info-toggle').focus();}}});
window.addEventListener('popstate',restore);
root.classList.add('ready');restore();
